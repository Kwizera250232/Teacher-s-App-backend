/** Student achievement titles — Hall of Fame catalog */
const ACHIEVEMENT_TITLES = {
  quiz_champion: {
    key: 'quiz_champion',
    emoji: '🥇',
    label: 'Quiz Champion',
    description: 'Score 95% or above on a quiz.',
    color: '#f59e0b',
  },
  rising_star: {
    key: 'rising_star',
    emoji: '🌟',
    label: 'Rising Star',
    description: 'Significant improvement compared to a previous attempt.',
    color: '#8b5cf6',
  },
  knowledge_master: {
    key: 'knowledge_master',
    emoji: '📚',
    label: 'Knowledge Master',
    description: 'Completed all assigned learning activities in class.',
    color: '#0ea5e9',
  },
  most_active_learner: {
    key: 'most_active_learner',
    emoji: '🔥',
    label: 'Most Active Learner',
    description: 'Most active student during the week.',
    color: '#ef4444',
  },
  accuracy_expert: {
    key: 'accuracy_expert',
    emoji: '🎯',
    label: 'Accuracy Expert',
    description: 'Highest accuracy rate across quizzes.',
    color: '#10b981',
  },
  fast_learner: {
    key: 'fast_learner',
    emoji: '🚀',
    label: 'Fast Learner',
    description: 'Completed learning tasks quickly with high scores.',
    color: '#6366f1',
  },
  problem_solver: {
    key: 'problem_solver',
    emoji: '💡',
    label: 'Problem Solver',
    description: 'Excelled in critical-thinking and problem-solving questions.',
    color: '#14b8a6',
  },
  team_supporter: {
    key: 'team_supporter',
    emoji: '🤝',
    label: 'Team Supporter',
    description: 'Frequently helps classmates and contributes positively.',
    color: '#ec4899',
  },
  class_legend: {
    key: 'class_legend',
    emoji: '👑',
    label: 'Class Legend',
    description: 'Outstanding performance for an entire month.',
    color: '#b45309',
  },
};

function titleMeta(key) {
  return ACHIEVEMENT_TITLES[key] || null;
}

function formatFeedHeadline({ studentName, groupName, titleKey, metadata }) {
  const t = titleMeta(titleKey);
  if (!t) return `${studentName} earned a new title.`;
  const team = groupName ? ` (${groupName})` : '';
  const pct = metadata?.percentage;
  if (titleKey === 'quiz_champion' && pct != null) {
    return `${studentName}${team} earned "${t.label}" with a score of ${pct}%.`;
  }
  if (titleKey === 'knowledge_master') {
    return `${studentName}${team} earned "${t.label}" after completing all weekly assignments.`;
  }
  if (titleKey === 'class_legend') {
    return `${studentName}${team} became "${t.label}" for maintaining top performance throughout the month.`;
  }
  return `${studentName}${team} earned "${t.emoji} ${t.label}".`;
}

module.exports = { ACHIEVEMENT_TITLES, titleMeta, formatFeedHeadline };
