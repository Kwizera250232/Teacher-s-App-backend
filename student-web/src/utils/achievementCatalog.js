export const ACHIEVEMENT_TITLES = {
  quiz_champion: { emoji: '🥇', label: 'Quiz Champion', color: '#f59e0b' },
  rising_star: { emoji: '🌟', label: 'Rising Star', color: '#8b5cf6' },
  knowledge_master: { emoji: '📚', label: 'Knowledge Master', color: '#0ea5e9' },
  most_active_learner: { emoji: '🔥', label: 'Most Active Learner', color: '#ef4444' },
  accuracy_expert: { emoji: '🎯', label: 'Accuracy Expert', color: '#10b981' },
  fast_learner: { emoji: '🚀', label: 'Fast Learner', color: '#6366f1' },
  problem_solver: { emoji: '💡', label: 'Problem Solver', color: '#14b8a6' },
  team_supporter: { emoji: '🤝', label: 'Team Supporter', color: '#ec4899' },
  class_legend: { emoji: '👑', label: 'Class Legend', color: '#b45309' },
};

export function titleMeta(key) {
  return ACHIEVEMENT_TITLES[key] || null;
}
