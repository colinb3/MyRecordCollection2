import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Box from "@mui/material/Box";
import CoverImage from "./CoverImage";
import {
  type Record,
  type ColumnVisibilityMap,
  type RecordTableSortPreference,
} from "../types";
import { formatLocalDate } from "../dateUtils";

// Clean column definitions with wrapping via cellClassName
const columns: GridColDef[] = [
  {
    field: "cover",
    headerName: "",
    width: 116,
    sortable: false,
    renderCell: (params) => {
      const title = params.row.record ?? "cover";
      const coverUrl =
        typeof params.row.cover === "string" && params.row.cover.trim()
          ? params.row.cover.trim()
          : null;
      return (
        <Box
          sx={{
            ml: -0.5,
            width: 100,
            height: 100,
          }}
        >
          <CoverImage
            src={coverUrl}
            alt={title}
            variant="rounded"
            iconSize="small"
            sx={{
              width: 100,
              height: 100,
              borderRadius: 1,
            }}
          />
        </Box>
      );
    },
  },
  {
    field: "record",
    headerName: "Record",
    flex: 1.5,
    minWidth: 120,
    hideable: false,
    cellClassName: "wrapCell",
    renderCell: (params) => (
      <div className="wrapText" style={{ width: "100%" }}>
        {params.value}
      </div>
    ),
  },
  {
    field: "artist",
    headerName: "Artist",
    flex: 1.25,
    minWidth: 90,
    cellClassName: "wrapCell",
    renderCell: (params) => (
      <div className="wrapText" style={{ width: "100%" }}>
        {params.value}
      </div>
    ),
  },
  {
    field: "rating",
    headerName: "Rating",
    type: "number",
    flex: 0.5,
    minWidth: 80,
    filterable: false,
    align: "left",
    headerAlign: "left",
  },
  {
    field: "tags",
    headerName: "Tags",
    flex: 1.5,
    minWidth: 120,
    sortable: false,
    filterable: false,
    valueGetter: (value: string[]) => value.join(", "),
    cellClassName: "wrapCell",
    renderCell: (params) => (
      <div className="wrapText" style={{ width: "100%" }}>
        {params.value}
      </div>
    ),
  },
  {
    field: "release",
    headerName: "Release",
    type: "number",
    flex: 0.5,
    minWidth: 80,
    align: "left",
    headerAlign: "left",
    filterable: false,
    renderCell: (params) => {
      const val = params.value;
      if (typeof val === "number") {
        return val > 0 ? val.toString() : "";
      }
      return val ?? "";
    },
  },
  {
    field: "added",
    headerName: "Added",
    flex: 0.6,
    minWidth: 105,
    renderCell: (params) => {
      const val = params.value;
      if (typeof val === "string") {
        const formatted = formatLocalDate(val);
        return formatted ?? val;
      }
      return val;
    },
  },
];

interface RecordTableProps {
  records: Record[];
  selectedId?: number;
  onSelect?: (record: Record | null) => void;
  initialColumnVisibility?: ColumnVisibilityMap;
  defaultSort?: RecordTableSortPreference;
  // When true, shows the DataGrid loading overlay
  loading?: boolean;
}

export default function RecordTable({
  records,
  selectedId,
  onSelect,
  initialColumnVisibility,
  defaultSort,
  loading = false,
}: RecordTableProps) {
  const handleRowClick = (params: { row: Record }) => {
    onSelect?.(params.row as Record);
  };

  const getRowClassName = (params: { id: number | string }) =>
    params.id == selectedId ? "selected-row" : "";

  const gridInitialState = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = {};

    if (defaultSort) {
      state.sorting = {
        sortModel: [{ field: defaultSort.field, sort: defaultSort.order }],
      };
    }

    if (initialColumnVisibility) {
      state.columns = {
        columnVisibilityModel: { ...initialColumnVisibility },
      };
    }

    return Object.keys(state).length > 0 ? state : undefined;
  }, [defaultSort, initialColumnVisibility]);

  const gridKey = useMemo(() => {
    const visibilityPart = initialColumnVisibility
      ? Object.entries(initialColumnVisibility)
          .map(([key, val]) => `${key}:${val ? 1 : 0}`)
          .join("|")
      : "";
    const sortPart = defaultSort
      ? `${defaultSort.field}:${defaultSort.order}`
      : "";
    return `${visibilityPart}::${sortPart}`;
  }, [initialColumnVisibility, defaultSort]);

  return (
    <DataGrid
      key={gridKey}
      rows={records}
      columns={columns}
      loading={loading}
      initialState={gridInitialState}
      density="comfortable"
      rowHeight={89}
      getRowId={(row) => row.id}
      onRowClick={handleRowClick}
      getRowClassName={getRowClassName}
      checkboxSelection={false}
      disableRowSelectionOnClick={false}
      hideFooterSelectedRowCount
      sx={{
        border: "none",
        height: "100%",
        // Smooth transition for row hover background-color
        "& .MuiDataGrid-row": {
          transition: "background-color 0.2s ease",
        },
        "& .MuiDataGrid-cell": {
          display: "flex",
          alignItems: "center",
          py: 1,
          // allow content to shrink so wrapping can occur
          minWidth: 0,
        },
        "& .wrapCell .MuiDataGrid-cellContent": {
          whiteSpace: "normal",
          overflow: "hidden",
          textOverflow: "clip",
          overflowWrap: "anywhere",
          lineHeight: 1.2,
          display: "block",
        },
        // stronger override in case cellContent class changes in version updates
        "& .wrapCell": {
          whiteSpace: "normal !important",
        },
        "& .wrapCell .wrapText": {
          whiteSpace: "normal",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          lineHeight: 1.2,
          alignSelf: "center",
        },
      }}
    />
  );
}
