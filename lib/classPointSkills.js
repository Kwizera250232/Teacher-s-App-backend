const SKILLS = [
  { id: 'on_task', label: 'On task', emoji: '👍' },
  { id: 'participating', label: 'Participating', emoji: '💡' },
  { id: 'persistence', label: 'Persistence', emoji: '🏔️' },
  { id: 'helping', label: 'Helping others', emoji: '🤝' },
  { id: 'working_hard', label: 'Working hard', emoji: '⚡' },
];

const TEAM_ROLES = [
  { id: 'captain', label: 'Captain', emoji: '⭐' },
  { id: 'motivator', label: 'Motivator', emoji: '🔥' },
  { id: 'researcher', label: 'Researcher', emoji: '🔍' },
  { id: 'organizer', label: 'Organizer', emoji: '📋' },
  { id: 'helper', label: 'Helper', emoji: '🤝' },
  { id: 'presenter', label: 'Presenter', emoji: '🎤' },
];

function skillMeta(skillId) {
  return SKILLS.find((s) => s.id === skillId) || SKILLS[0];
}

function teamRoleMeta(roleId) {
  if (!roleId) return null;
  return TEAM_ROLES.find((r) => r.id === roleId) || { id: roleId, label: roleId, emoji: '🏷️' };
}

function formatPointEvent(row) {
  return {
    id: row.id,
    student_id: row.student_id,
    student_name: row.student_name,
    teacher_name: row.teacher_name,
    group_id: row.group_id,
    whole_class: row.whole_class,
    value: row.value,
    skill: row.skill,
    skill_meta: skillMeta(row.skill),
    note: row.note,
    undone: row.undone,
    created_at: row.created_at,
  };
}

module.exports = {
  SKILLS,
  TEAM_ROLES,
  skillMeta,
  teamRoleMeta,
  formatPointEvent,
};
