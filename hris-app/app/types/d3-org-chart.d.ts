declare module "d3-org-chart" {
	export class OrgChart {
		container(container: HTMLElement | null): OrgChart;
		data(data: any[]): OrgChart;
		nodeWidth(width: number | ((d: any) => number)): OrgChart;
		nodeHeight(height: number | ((d: any) => number)): OrgChart;
		nodeContent(content: (d: any) => string): OrgChart;
		layout(layout: string): OrgChart;
		onNodeClick(callback: (node: any) => void): OrgChart;
		svgWidth(width: number): OrgChart;
		svgHeight(height: number): OrgChart;
		render(): OrgChart;
	}
}

