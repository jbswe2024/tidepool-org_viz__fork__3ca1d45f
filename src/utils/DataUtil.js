import bows from 'bows';
import crossfilter from 'crossfilter'; // eslint-disable-line import/no-unresolved
import moment from 'moment-timezone';
import _ from 'lodash';

import {
  DEFAULT_BG_BOUNDS,
  MS_IN_DAY,
  MS_IN_MIN,
  MGDL_UNITS,
} from './constants';

import {
  addDuration,
  getMsPer24,
  getOffset,
  getTimezoneFromTimePrefs,
} from './datetime';

/* eslint-disable lodash/prefer-lodash-method */


/* global __DEV__ */

export class DataUtil {
  /**
   * @param {Array} data Raw Tidepool data
   */
  constructor(data = []) {
    this.log = bows('DataUtil');
    this.startTimer = __DEV__ ? name => console.time(name) : _.noop;
    this.endTimer = __DEV__ ? name => console.timeEnd(name) : _.noop;
    this.init(data);
  }

  init = data => {
    this.startTimer('init total');
    this.data = crossfilter([]);
    this.endpoints = {};

    this.addData(data);

    this.buildDimensions();
    this.buildFilters();
    this.buildSorts();
    this.endTimer('init total');
  };

  addData = data => {
    this.startTimer('addData');
    this.log('addData', 'count', data.length);
    this.data.add(_.filter(_.uniqBy(data, 'id'), _.isPlainObject)); // TODO: determine if lodash methods are performant enough
    this.endTimer('addData');
  }

  /**
   * TODO: need to figure out if I should only normalize datums
   * upon return
   *
   * Thinking this would be required for allowing the user to easily switch
   * timezones on the fly in a future UI
   *
   * This would mean requiring the client to send timeprefs
   * with the requests.
   *
   * It would also require possibly 'converting' the provided
   * endpoints to UTC time before filtering via the timePrefs object
   * (or sending them in UTC)
   *
   * This assumes that the data is stored in UTC -- need to confirm
   */
  normalizeDatum = datum => {
    const d = { ...datum };

    if (this.timezoneName) {
      d.normalTime = d.time;
      d.displayOffset = -getOffset(d.time, this.timezoneName);
    } else {
      // timezoneOffset is an optional attribute according to the Tidepool data model
      if (d.timezoneOffset != null && d.conversionOffset != null) {
        d.normalTime = addDuration(d.time, d.timezoneOffset * MS_IN_MIN + d.conversionOffset);
      } else {
        d.normalTime = _.isEmpty(d.deviceTime) ? d.time : `${d.deviceTime}.000Z`;
      }

      // displayOffset always 0 when not timezoneAware
      d.displayOffset = 0;
      if (d.deviceTime && d.normalTime.slice(0, -5) !== d.deviceTime) {
        d.warning = 'Combining `time` and `timezoneOffset` does not yield `deviceTime`.';
      }
    }

    switch (d.type) {
      case 'basal':
        d.normalEnd = addDuration(d.normalTime, d.duration);
        break;

      case 'cbg':
      case 'smbg':
        d.msPer24 = getMsPer24(d.normalTime, this.timezoneName);
        break;

      default:
        break;
    }

    return d;
  }

  removeData = predicate => {
    this.clearFilters();
    this.data.remove(predicate);
  }

  buildDimensions = () => {
    this.startTimer('buildDimensions');
    this.dimension = {};
    this.dimension.byDate = this.data.dimension(
      d => moment.utc(d.time).tz('UTC').toISOString()
    );

    this.dimension.byDayOfWeek = this.data.dimension(
      d => moment.utc(d.time).tz('UTC').day()
    );

    this.dimension.byType = this.data.dimension(d => d.type);
    this.endTimer('buildDimensions');
  };

  buildFilters = () => {
    this.startTimer('buildFilters');
    this.filter = {};
    this.filter.byActiveDays = activeDays => this.dimension.byDayOfWeek
      .filterFunction(d => _.includes(activeDays, d));

    this.filter.byEndpoints = endpoints => this.dimension.byDate.filterRange(endpoints);
    this.filter.byType = type => this.dimension.byType.filterExact(type);
    this.endTimer('buildFilters');
  };

  buildSorts = () => {
    this.startTimer('buildSorts');
    this.sort = {};
    this.sort.byDate = array => (
      crossfilter.quicksort.by(d => d.time)(array, 0, array.length)
    );
    this.endTimer('buildSorts');
  };

  clearFilters = () => {
    this.dimension.byDate.filterAll();
    this.dimension.byDayOfWeek.filterAll();
    this.dimension.byType.filterAll();
  };

  setEndpoints = endpoints => {
    this.endpoints = {};

    if (endpoints) {
      this.endpoints.current = _.map(endpoints, e => moment.utc(e).toISOString());

      this.endpoints.daysInRange = moment.utc(endpoints[1])
        .diff(moment.utc(endpoints[0])) / MS_IN_DAY;

      this.endpoints.activeDaysInRange = this.endpoints.daysInRange;

      this.endpoints.next = [
        this.endpoints.current[1],
        moment.utc(endpoints[1]).add(this.endpoints.daysInRange, 'days').toISOString(),
      ];

      this.endpoints.prev = [
        moment.utc(endpoints[0]).subtract(this.endpoints.daysInRange, 'days').toISOString(),
        this.endpoints.current[0],
      ];
    }
  };

  setActiveDays = activeDays => {
    this.activeDays = activeDays || [0, 1, 2, 3, 4, 5, 6];

    const { daysInRange } = this.endpoints;
    if (daysInRange) {
      this.endpoints.activeDaysInRange = daysInRange / 7 * this.activeDays.length;
    }
  }

  setTypes = types => {
    this.types = _.isArray(types) ? types : [];

    if (_.isPlainObject(types)) {
      this.types = _.map(types, (value, type) => ({
        type,
        ...value,
      }));
    }
  }

  setTimezoneName = (timePrefs = {}) => {
    this.timezoneName = undefined;

    if (timePrefs.timezoneAware) {
      this.timezoneName = getTimezoneFromTimePrefs(timePrefs);
    }
  }

  setBGPrefs = (bgPrefs = {}) => {
    const {
      bgBounds = DEFAULT_BG_BOUNDS[MGDL_UNITS],
      bgUnits = MGDL_UNITS,
    } = bgPrefs;

    this.bgBounds = bgBounds;
    this.bgUnits = bgUnits;
  }

  queryData = (query = {}) => {
    this.startTimer('queryData total');
    const {
      activeDays,
      endpoints,
      // stats,
      timePrefs,
      bgPrefs,
      types,
    } = query;

    this.clearFilters();

    this.setEndpoints(endpoints);
    this.setActiveDays(activeDays);
    this.setTypes(types);
    this.setTimezoneName(timePrefs);
    this.setBGPrefs(bgPrefs);

    const data = {
      current: {},
      next: {},
      prev: {},
    };

    _.each(_.keys(data), range => {
      if (this.endpoints[range]) {
        // Filter the data set by date range
        this.filter.byEndpoints(this.endpoints[range]);

        data[range].range = this.endpoints[range];

        // Filter out any inactive days of the week
        if (this.activeDays) this.filter.byActiveDays(this.activeDays);

        // Populate requested data
        if (this.types.length) {
          data[range].data = {};

          _.each(this.types, ({ type, select, sort = {} }) => {
            const fields = _.isString(select) ? _.map(select.split(','), _.trim) : select;
            let typeData = this.filter.byType(type).top(Infinity);

            // Normalize data
            this.startTimer(`normalize | ${type} | ${range}`);
            typeData = _.map(typeData, this.normalizeDatum);
            this.endTimer(`normalize | ${type} | ${range}`);

            // Sort data
            this.startTimer(`sort | ${type} | ${range}`);
            let sortOpts = sort;
            if (_.isString(sortOpts)) {
              const sortArray = _.map(sort.split(','), _.trim);
              sortOpts = {
                field: sortArray[0],
                order: sortArray[1],
              };
            }

            if (sortOpts.field) {
              typeData = _.sortBy(typeData, [sortOpts.field]);
            }

            if (sortOpts.order === 'desc') typeData.reverse();
            this.endTimer(`sort | ${type} | ${range}`);

            // Pick selected fields
            this.startTimer(`select fields | ${type} | ${range}`);
            typeData = _.map(typeData, d => _.pick(d, fields));
            this.endTimer(`select fields | ${type} | ${range}`);

            data[range].data[type] = typeData;
          });
        }
      }
    });
    this.endTimer('queryData total');

    return {
      data,
      timezoneName: this.timezoneName,
      bgUnits: this.bgUnits,
    };
  }
}

export default DataUtil;
