/** @module TimeHeader — day/week/month scale header for the Gantt chart */

import { useMemo } from "react";
import { dateRange, parseDate } from "../../utils/dateUtils";
import styles from "./Gantt.module.css";

interface TimeHeaderProps {
  timelineStart: string;
  timelineEnd: string;
  dayWidth: number;
}

interface MonthGroup {
  key: string;
  label: string;
  dayCount: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function TimeHeader({
  timelineStart,
  timelineEnd,
  dayWidth,
}: TimeHeaderProps): React.JSX.Element {
  const days = useMemo(
    () => dateRange(timelineStart, timelineEnd),
    [timelineStart, timelineEnd],
  );

  const months = useMemo(() => {
    const groups: MonthGroup[] = [];
    let current: MonthGroup | null = null;

    for (const day of days) {
      const d = parseDate(day);
      const key = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth())}`;
      const label = `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear())}`;

      if (current && current.key === key) {
        current.dayCount++;
      } else {
        current = { key, label, dayCount: 1 };
        groups.push(current);
      }
    }

    return groups;
  }, [days]);

  return (
    <div className={styles.timeHeader}>
      <div className={styles.monthRow}>
        {months.map((m) => (
          <div
            key={m.key}
            className={styles.monthCell}
            style={{ width: m.dayCount * dayWidth }}
          >
            {m.label}
          </div>
        ))}
      </div>
      <div className={styles.dayRow}>
        {days.map((day) => {
          const d = parseDate(day);
          const dow = d.getUTCDay();
          const isWknd = dow === 0 || dow === 6;
          const cls = isWknd
            ? `${styles.dayCell} ${styles.dayCellWeekend}`
            : styles.dayCell;

          return (
            <div key={day} className={cls} style={{ width: dayWidth }}>
              {String(d.getUTCDate())}
            </div>
          );
        })}
      </div>
    </div>
  );
}
