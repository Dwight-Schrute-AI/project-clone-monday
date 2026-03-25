/** @module TimeHeader — adaptive time scale header for the Gantt chart */

import { useMemo } from "react";
import { dateRange, parseDate } from "../../utils/dateUtils";
import styles from "./Gantt.module.css";

interface TimeHeaderProps {
  timelineStart: string;
  timelineEnd: string;
  dayWidth: number;
  showDayNumbers?: boolean;
}

interface TopGroup {
  key: string;
  label: string;
  dayCount: number;
}

interface BottomCell {
  key: string;
  label: string;
  dayCount: number;
  isWeekend: boolean;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO week number (Mon=1) */
function isoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function TimeHeader({
  timelineStart,
  timelineEnd,
  dayWidth,
}: TimeHeaderProps): React.JSX.Element {
  const days = useMemo(
    () => dateRange(timelineStart, timelineEnd),
    [timelineStart, timelineEnd],
  );

  // Determine scale mode based on dayWidth
  // Day view (>=20): top=months, bottom=day numbers
  // Week view (>=8): top=months, bottom=week numbers
  // Month/Year view (<8): top=years, bottom=months (no day row)
  const mode = dayWidth >= 20 ? "day" : dayWidth >= 8 ? "week" : "month";

  const { topGroups, bottomCells } = useMemo(() => {
    const top: TopGroup[] = [];
    const bottom: BottomCell[] = [];

    if (mode === "day") {
      // Top row: months, Bottom row: day numbers
      let curMonth: TopGroup | null = null;
      for (const day of days) {
        const d = parseDate(day);
        const mKey = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth())}`;
        const mLabel = `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear())}`;
        if (curMonth && curMonth.key === mKey) {
          curMonth.dayCount++;
        } else {
          curMonth = { key: mKey, label: mLabel, dayCount: 1 };
          top.push(curMonth);
        }
        const dow = d.getUTCDay();
        bottom.push({
          key: day,
          label: String(d.getUTCDate()),
          dayCount: 1,
          isWeekend: dow === 0 || dow === 6,
        });
      }
    } else if (mode === "week") {
      // Top row: months, Bottom row: week numbers (W1, W2, ...)
      let curMonth: TopGroup | null = null;
      let curWeek: BottomCell | null = null;
      for (const day of days) {
        const d = parseDate(day);
        const mKey = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth())}`;
        const mLabel = `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear())}`;
        if (curMonth && curMonth.key === mKey) {
          curMonth.dayCount++;
        } else {
          curMonth = { key: mKey, label: mLabel, dayCount: 1 };
          top.push(curMonth);
        }
        const wn = isoWeekNumber(d);
        const wKey = `${String(d.getUTCFullYear())}-W${String(wn)}`;
        const dow = d.getUTCDay();
        const isMonday = dow === 1;
        if (curWeek && curWeek.key === wKey) {
          curWeek.dayCount++;
        } else {
          // Start new week cell. If this isn't a Monday, the week is partial at boundary.
          curWeek = { key: wKey, label: `W${String(wn)}`, dayCount: 1, isWeekend: false };
          bottom.push(curWeek);
        }
        // Mark if this individual day is a weekend (not used for week cells, but kept for consistency)
        if (isMonday && curWeek) curWeek.isWeekend = false;
      }
    } else {
      // Month/Year view: Top row: years, Bottom row: months
      let curYear: TopGroup | null = null;
      let curMonth: BottomCell | null = null;
      for (const day of days) {
        const d = parseDate(day);
        const yKey = String(d.getUTCFullYear());
        if (curYear && curYear.key === yKey) {
          curYear.dayCount++;
        } else {
          curYear = { key: yKey, label: yKey, dayCount: 1 };
          top.push(curYear);
        }
        const mKey = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth())}`;
        if (curMonth && curMonth.key === mKey) {
          curMonth.dayCount++;
        } else {
          curMonth = {
            key: mKey,
            label: MONTH_NAMES[d.getUTCMonth()]!,
            dayCount: 1,
            isWeekend: false,
          };
          bottom.push(curMonth);
        }
      }
    }

    return { topGroups: top, bottomCells: bottom };
  }, [days, mode]);

  return (
    <div className={styles.timeHeader}>
      <div className={styles.monthRow}>
        {topGroups.map((g) => (
          <div
            key={g.key}
            className={styles.monthCell}
            style={{ width: g.dayCount * dayWidth }}
          >
            {g.dayCount * dayWidth > 30 ? g.label : ""}
          </div>
        ))}
      </div>
      <div className={styles.dayRow}>
        {bottomCells.map((c) => {
          const w = c.dayCount * dayWidth;
          const cls = c.isWeekend
            ? `${styles.dayCell} ${styles.dayCellWeekend}`
            : styles.dayCell;
          return (
            <div key={c.key} className={cls} style={{ width: w }}>
              {w >= 16 ? c.label : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
