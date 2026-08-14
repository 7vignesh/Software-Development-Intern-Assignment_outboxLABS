import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (value: any, row: T) => ReactNode;
}

interface EmailTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
}

export default function EmailTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
}: EmailTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-sm font-medium text-gray-600"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row[keyField]} className="even:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-700">
                  {col.render
                    ? col.render(row[col.key], row)
                    : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
