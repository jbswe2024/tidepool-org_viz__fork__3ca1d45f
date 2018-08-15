/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2016, Tidepool Project
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 *
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

import React, { PropTypes } from 'react';
import _ from 'lodash';
import bows from 'bows';
import { SizeMe } from 'react-sizeme';
import { VictoryBar, VictoryContainer } from 'victory';
import { Collapse } from 'react-collapse';
import { formatPercentage, formatInsulin } from '../../../utils/format';
import { formatDuration } from '../../../utils/datetime';
import styles from './Stat.css';
import cx from 'classnames';
import HoverBar, { SizedHoverLabel } from './HoverBar';
import CollapseIconOpen from './assets/expand-more-24-px.svg';
import CollapseIconClose from './assets/chevron-right-24-px.svg';

export const statColors = {
  basal: '#0096d1',
  basalAutomated: '#00e9fa',
  bolus: '#7ed1f2',
  totalInsulin: '#0096d1',
  veryLow: '#fb5951',
  low: '#f28684',
  target: '#76db9b',
  high: '#b49de3',
  veryHigh: '#8c65d6',
  white: '#ffffff',
  axis: '#e7e9ee',
  muted: '#c1c9d6',
};

export const statTypes = {
  barHorizontal: 'barHorizontal',
  simple: 'simple',
};

export const statFormats = {
  bgRange: 'bgRange',
  bgValue: 'bgValue',
  duration: 'duration',
  percentage: 'percentage',
  units: 'units',
};

class Stat extends React.PureComponent {
  static propTypes = {
    alwaysShowTooltips: PropTypes.bool,
    bgPrefs: PropTypes.shape({
      bgBounds: PropTypes.shape({
        veryHighThreshold: PropTypes.number.isRequired,
        targetUpperBound: PropTypes.number.isRequired,
        targetLowerBound: PropTypes.number.isRequired,
        veryLowThreshold: PropTypes.number.isRequired,
      }),
      bgUnits: PropTypes.string.isRequired,
    }),
    categories: PropTypes.object,
    chartHeight: PropTypes.number,
    collapsible: PropTypes.bool,
    data: PropTypes.shape({
      data: PropTypes.arrayOf(PropTypes.shape(
        {
          id: PropTypes.string.isRequired,
          value: PropTypes.number.isRequired,
          title: PropTypes.string,
        }
      )).isRequired,
      total: PropTypes.shape(
        {
          id: PropTypes.string,
          value: PropTypes.number.isRequired,
        }
      ),
      primaryDataPath: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.array,
      ]),
      secondaryIndex: PropTypes.number,
    }),
    dataFormat: PropTypes.shape({
      datum: PropTypes.oneOf(_.values(statFormats)),
      tooltip: PropTypes.oneOf(_.values(statFormats)),
      primary: PropTypes.oneOf(_.values(statFormats)),
      secondary: PropTypes.oneOf(_.values(statFormats)),
    }),
    isOpened: PropTypes.bool,
    muteOthersOnHover: PropTypes.bool,
    primaryStat: PropTypes.string,
    title: PropTypes.string.isRequired,
    type: PropTypes.oneOf(_.keys(statTypes)),
  };

  static defaultProps = {
    alwaysShowTooltips: false,
    categories: {},
    chartHeight: 0,
    collapsible: true,
    dataFormat: {
      datum: statFormats.percentage,
      tooltip: statFormats.percentage,
      primary: statFormats.percentage,
      secondary: statFormats.percentage,
    },
    isOpened: true,
    muteOthersOnHover: true,
    primaryStat: '',
    type: statTypes.barHorizontal.type,
  };

  constructor(props) {
    super(props);
    this.log = bows('Stat');

    this.state = this.getStateByType(props);
    this.setChartPropsByType(props);
  }

  toggleIsOpened = () => {
    this.setState({
      isOpened: !this.state.isOpened,
    });
  }

  componentWillReceiveProps(nextProps) {
    this.setState(this.getStateByType(nextProps));
    this.setChartPropsByType(nextProps);
  }

  renderChart = (size) => (
    <Collapse
      isOpened={this.state.isOpened}
      springConfig={{ stiffness: 200, damping: 23 }}
    >
      <div className={styles.chartContainer}>
        <this.chartRenderer {...this.chartProps} ref={this.setChartRef} width={size.width || 270} />
      </div>
    </Collapse>
  );

  render() {
    const statOuterClasses = cx({
      [styles.Stat]: true,
      [styles[this.props.type]]: true,
      [styles.isCollapsible]: this.state.isCollapsible,
      [styles.isOpen]: this.state.isOpened,
    });

    const primaryDataPath = _.get(this.props.data, 'primaryDataPath');
    const primaryData = _.get(this.props.data, primaryDataPath);
    const primaryValue = this.formatValue(primaryData.value, this.props.dataFormat.primary);

    return (
      <div className={statOuterClasses}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitle}>{this.state.chartTitle}</div>

          <div className={styles.chartPrimary}>
            {primaryValue && (
              <div
                className={styles.primaryValue}
                style={{
                  color: statColors[primaryData.id],
                }}
              >
                {primaryValue.value}
                <span className={styles.primarySuffix}>{primaryValue.suffix}</span>
              </div>
            )}

            {this.state.isCollapsible && (
              <div className={styles.chartCollapse}>
                <img
                  src={this.state.isOpened ? CollapseIconOpen : CollapseIconClose}
                  onClick={this.toggleIsOpened}
                />
              </div>
            )}
          </div>

        </div>
        {this.chartRenderer && <SizeMe render={({ size }) => (this.renderChart(size))} />}
      </div>
    );
  }

  getStateByType = (props) => {
    const state = {
      chartTitle: props.title,
    };
    switch (props.type) {
      case 'simple':
        state.isCollapsible = false;
        state.isOpened = false;
        break;

      case 'barHorizontal':
      default:
        state.isCollapsible = props.collapsible;
        state.isOpened = props.isOpened;
        state.hoveredDatumIndex = -1;
        break;
    }

    return state;
  }

  setChartPropsByType = (props) => {
    const { type, data, ...rest } = props;
    let chartRenderer = VictoryBar;
    const chartProps = _.defaults({
      animate: { duration: 300, onLoad: { duration: 0 } },
      data: _.map(data.data, (d, i) => ({
        x: i + 1,
        y: data.total ? d.value / data.total.value : d.value,
        id: d.id,
      })),
      labels: d => formatPercentage(d.y),
      style: {
        data: {
          fill: d => statColors[d.id],
        },
      },
    }, rest);

    let barWidth;
    let barSpacing;
    let chartHeight;
    let chartLabelWidth;
    let domain;
    let padding;
    let getStatColor;

    switch (type) {
      case 'simple':
        chartRenderer = null;
        break;

      case 'barHorizontal':
      default:
        domain = { y: [0, props.data.data.length], x: [0, 1] };
        barSpacing = chartProps.barSpacing || 4;
        chartHeight = chartProps.chartHeight;

        if (chartHeight > 0) {
          barWidth = ((chartHeight - barSpacing) / props.data.data.length) - (barSpacing / 2);
        } else {
          barWidth = chartProps.barWidth || 24;
          chartHeight = (barWidth + barSpacing) * props.data.data.length;
        }

        padding = { top: barWidth / 2, bottom: barWidth / 2 * -1 };
        chartLabelWidth = barWidth * 2.25;

        getStatColor = (datum) => {
          const { hoveredDatumIndex } = this.state;
          const isMuted = props.muteOthersOnHover
            && hoveredDatumIndex >= 0
            && hoveredDatumIndex !== datum.eventKey;

          return isMuted ? statColors.muted : statColors[datum.id];
        };

        _.assign(chartProps, {
          alignment: 'middle',
          containerComponent: <VictoryContainer responsive={false} />,
          cornerRadius: { top: 2, bottom: 2 },
          dataComponent: (
            <HoverBar
              domain={domain}
              barWidth={barWidth}
              barSpacing={barSpacing}
              chartLabelWidth={chartLabelWidth}
            />
          ),
          domain,
          events: [
            {
              target: 'data',
              eventHandlers: {
                onMouseOver: (event, target) => {
                  const datum = _.get(props.data, ['data', target.index], {});
                  this.setChartTitle(datum.title);
                  this.setState({ hoveredDatumIndex: target.index });
                  if (props.dataFormat.datumTooltip) {
                    return {
                      target: 'labels',
                      mutation: () => ({
                        active: true,
                      }),
                    };
                  }
                  return {};
                },
                onMouseOut: () => {
                  this.setChartTitle();
                  this.setState({ hoveredDatumIndex: -1 });
                  return {
                    target: 'labels',
                    mutation: () => ({ active: props.alwaysalwaysShowTooltips }),
                  };
                },
              },
            },
          ],
          height: chartHeight,
          horizontal: true,
          labelComponent: (
            <SizedHoverLabel
              active={props.alwaysShowTooltips}
              domain={domain}
              barWidth={barWidth}
              text={datum => {
                const { value, suffix } = this.formatValue(
                  _.get(props.data, ['data', datum.eventKey, 'value']),
                  props.dataFormat.datum,
                );
                return `${value}${suffix}`;
              }}
              tooltipText={datum => {
                const { value, suffix } = this.formatValue(
                  _.get(props.data, ['data', datum.eventKey, 'value']),
                  props.dataFormat.datumTooltip,
                );
                return `${value}${suffix}`;
              }}
            />
          ),
          padding,
          style: {
            data: {
              fill: d => getStatColor(d),
              width: () => barWidth,
            },
            labels: {
              fill: d => getStatColor(d),
              fontSize: barWidth * 0.833,
              fontWeight: 600,
              paddingLeft: chartLabelWidth,
            },
          },
        });
        break;
    }
    this.chartProps = chartProps;
    this.setChartRenderer(chartRenderer);
  }

  setChartTitle = (chartTitle = this.props.title) => {
    this.setState({
      chartTitle,
    });
  }

  setChartRef = (element) => {
    this.chartRef = element;
  }

  setChartRenderer = (chartRenderer) => {
    this.chartRenderer = chartRenderer;
  }

  formatValue = (inputValue, format, opts = {}) => {
    let suffix = '';
    let value = inputValue;
    const { total = _.get(this.props.data, 'total.value') } = opts;

    switch (format) {
      case statFormats.percentage:
        if (total) {
          value = value / total;
        }
        value = formatPercentage(value);
        break;

      case statFormats.duration:
        value = formatDuration(value, 'condensed');
        break;

      case statFormats.units:
        value = formatInsulin(value);
        suffix = 'u';
        break;

      default:
        break;
    }

    return {
      value,
      suffix,
    };
  }
}

export default Stat;
