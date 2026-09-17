export type BillableFilter = "all" | "billable" | "nonbillable";

export interface ReportFilters {
  clientIds: string[];
  projectIds: string[];
  taskIds: string[];
  tagIds: string[];
  /** Owner/admin only; the server ignores it for a member and keeps their own hours (D3). */
  userIds: string[];
  billable: BillableFilter;
  search: string;
}

export const EMPTY_FILTERS: ReportFilters = {
  clientIds: [],
  projectIds: [],
  taskIds: [],
  tagIds: [],
  userIds: [],
  billable: "all",
  search: "",
};
