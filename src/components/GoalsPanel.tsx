import { useState } from "react";
import { GOAL_SPECS, describeGoal, evaluateGoal, formatGoalValue, type Goal, type GoalMetric } from "../analysis/goals";
import type { MatchRecord } from "../lib/match";

interface Props {
  match: MatchRecord;
  goals: Goal[];
  onGoalsChange: (goals: Goal[]) => void;
}

const METRICS = Object.keys(GOAL_SPECS) as GoalMetric[];

export function GoalsPanel({ match, goals, onGoalsChange }: Props) {
  const [editing, setEditing] = useState(false);
  const results = goals.map((g) => evaluateGoal(match, g));
  const unused = METRICS.filter((m) => !goals.some((g) => g.metric === m));

  if (editing) {
    return (
      <div className="goals">
        <ul className="goal-edit-list">
          {goals.map((g, i) => {
            const spec = GOAL_SPECS[g.metric];
            return (
              <li key={g.metric}>
                <span>{spec.label}</span>
                <span className="muted small">{spec.direction === "max" ? "at most" : "at least"}</span>
                <input
                  id={`goal-target-${g.metric}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={spec.max}
                  step={spec.step}
                  value={g.target}
                  aria-label={`Target for ${spec.label}`}
                  onChange={(e) => {
                    const next = [...goals];
                    next[i] = { ...g, target: Math.max(0, Math.min(spec.max, Number(e.target.value) || 0)) };
                    onGoalsChange(next);
                  }}
                />
                <span className="muted small">{spec.unit}</span>
                <button className="link small" onClick={() => onGoalsChange(goals.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        {unused.length > 0 && (
          <div className="chips">
            {unused.map((m) => (
              <button
                key={m}
                className="chip"
                onClick={() => onGoalsChange([...goals, { metric: m, target: GOAL_SPECS[m].defaultTarget }])}
              >
                + {GOAL_SPECS[m].label}
              </button>
            ))}
          </div>
        )}
        <button className="primary small" onClick={() => setEditing(false)}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="goals">
      {match.me === null && <p className="hint">Mark yourself with “This is me” to check this match against your goals.</p>}
      {goals.length === 0 ? (
        <p className="muted">No goals yet.</p>
      ) : (
        <ul className="goal-list">
          {results.map(({ goal, value, met }) => (
            <li key={goal.metric} className={met === null ? "na" : met ? "met" : "missed"}>
              <span className="goal-mark" aria-hidden>
                {met === null ? "–" : met ? "✓" : "✗"}
              </span>
              <span className="goal-name">{describeGoal(goal)}</span>
              <span className="goal-value">
                {value === null
                  ? GOAL_SPECS[goal.metric].needsPoints && !match.points?.length
                    ? "tag points to check"
                    : "not enough data in this match"
                  : `${met ? "Met" : "Missed"}: ${formatGoalValue(goal.metric, value)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button className="ghost small" onClick={() => setEditing(true)}>
        Edit goals
      </button>
    </div>
  );
}
