import { stripTime } from "../utils/dateUtils";

import DayCard from "./DayCard";

const DailyPlanner = ({ days = [], entriesByDate = {}, loading, onAddIncome, onAddExpense }) => {
  if (loading) {
    return <p className="status">Loading days in this pay period...</p>;
  }

  if (!days.length) {
    return null;
  }

  return (
    <div className="daily-planner">
      {days.map((date) => {
        const key = stripTime(date).toISOString().slice(0, 10);
        return (
          <DayCard
            key={key}
            date={date}
            income={entriesByDate[key]?.income || []}
            expenses={entriesByDate[key]?.expenses || []}
            onAddIncome={(payload) => onAddIncome(date, payload)}
            onAddExpense={(payload) => onAddExpense(date, payload)}
          />
        );
      })}
    </div>
  );
};

export default DailyPlanner;
