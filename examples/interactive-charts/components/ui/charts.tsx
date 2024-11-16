import { ChartTypes, Result } from "@e2b/code-interpreter";
import ReactECharts, { EChartsOption } from "echarts-for-react";

export function RenderResult({
  result,
  viewMode,
}: {
  result: Result;
  viewMode: "static" | "interactive";
}) {
  if (viewMode === "static" && result.png) {
    return <img src={`data:image/png;base64,${result.png}`} alt="plot" />;
  }

  if (viewMode === "interactive" && result.extra?.chart) {
    return <Chart chart={result.extra.chart} />;
  }

  // Plotly charts are not supported yet
  // if (result.html) {
  //   return <div dangerouslySetInnerHTML={{ __html: result.html }} />;
  // }

  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}

export function Chart({ chart }: { chart: ChartTypes }) {
  const sharedOptions: EChartsOption = {
    // title: {
    //   text: chart.title,
    //   left: "center",
    //   textStyle: {
    //     fontSize: 14,
    //   },
    // },
    grid: { top: 30, right: 8, bottom: 28, left: 28 },
    legend: {
      // left: "left",
      // orient: "vertical",
    },
  };

  if (chart.type === "line") {
    const series = chart.elements.map((e) => {
      return {
        name: e.label,
        type: "line",
        data: e.points.map((p: [number, number]) => [p[0], p[1]]),
      };
    });

    const options: EChartsOption = {
      ...sharedOptions,
      xAxis: {
        type: "category",
        name: chart.x_label,
        nameLocation: "middle",
      },
      yAxis: {
        name: chart.y_label,
        nameLocation: "middle",
      },
      series,
      tooltip: {
        trigger: "axis",
      },
    };

    return <ReactECharts option={options} />;
  }

  if (chart.type === "scatter") {
    const series = chart.elements.map((e) => {
      return {
        name: e.label,
        type: "scatter",
        data: e.points.map((p: [number, number]) => [p[0], p[1]]),
      };
    });

    const options: EChartsOption = {
      ...sharedOptions,
      xAxis: {
        name: chart.x_label,
        nameLocation: "middle",
      },
      yAxis: {
        name: chart.y_label,
        nameLocation: "middle",
      },
      series,
      tooltip: {
        trigger: "axis",
      },
    };

    return <ReactECharts option={options} />;
  }

  if (chart.type === "bar") {
    const data = Object.groupBy(chart.elements, ({ group }) => group);

    const series = Object.entries(data).map(([group, elements]) => ({
      name: group,
      type: "bar",
      stack: "total",
      data: elements?.map((e) => [e.label, e.value]),
    }));

    const options: EChartsOption = {
      ...sharedOptions,
      xAxis: {
        type: "category",
        name: chart.x_label,
        nameLocation: "middle",
      },
      yAxis: {
        name: chart.y_label,
        nameLocation: "middle",
      },
      series,
      tooltip: {
        trigger: "axis",
      },
    };

    return <ReactECharts option={options} />;
  }

  if (chart.type === "pie") {
    const options: EChartsOption = {
      ...sharedOptions,
      tooltip: {
        trigger: "item",
      },
      series: [
        {
          type: "pie",
          data: chart.elements.map((e) => ({
            value: e.angle,
            name: e.label,
          })),
        },
      ],
    };

    return <ReactECharts option={options} />;
  }

  if (chart.type === "box_and_whisker") {
    const series = chart.elements.map((e) => {
      return {
        name: e.label,
        type: "boxplot",
        data: [[e.min, e.first_quartile, e.median, e.third_quartile, e.max]],
      };
    });

    const options: EChartsOption = {
      ...sharedOptions,
      xAxis: {
        type: "category",
        name: chart.x_label,
        nameLocation: "middle",
      },
      yAxis: {
        name: chart.y_label,
        nameLocation: "middle",
        min: "dataMin",
        max: "dataMax",
      },
      series,
      tooltip: {
        trigger: "item",
      },
    };

    return <ReactECharts option={options} />;
  }

  if (chart.type === "superchart") {
    return (
      <div className="grid grid-cols-2 gap-4">
        {chart.elements.map((e, index) => (
          <div key={index}>
            <Chart chart={e} />
          </div>
        ))}
      </div>
    );
  }

  return <pre>{JSON.stringify(chart, null, 2)}</pre>;
}
