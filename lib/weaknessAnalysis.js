/**
 * Analyze student quiz marks and produce weakness insights + advice for parents.
 * Returns { weakSubjects, strongSubjects, overallAdvice, weaknessSummary }
 */
function analyzeWeaknesses({ quizzes, average, percentage, rank, totalStudents }) {
  const weakSubjects = [];
  const strongSubjects = [];
  const subjectMap = {};

  for (const q of quizzes) {
    if (q.marks === null || q.marks === undefined) continue;
    const max = parseFloat(q.max_marks || q.max || 0);
    if (!max) continue;
    const subj = q.subject || 'General';
    if (!subjectMap[subj]) subjectMap[subj] = { total: 0, max: 0, count: 0, quizzes: [] };
    subjectMap[subj].total += parseFloat(q.marks);
    subjectMap[subj].max += max;
    subjectMap[subj].count++;
    subjectMap[subj].quizzes.push({ name: q.name, marks: parseFloat(q.marks), max });
  }

  for (const [subj, data] of Object.entries(subjectMap)) {
    const pct = data.max ? (data.total / data.max) * 100 : 0;
    if (pct < 50) {
      weakSubjects.push({
        subject: subj,
        percentage: Math.round(pct),
        total: data.total,
        max: data.max,
        quizCount: data.count,
        quizzes: data.quizzes,
      });
    } else if (pct >= 70) {
      strongSubjects.push({
        subject: subj,
        percentage: Math.round(pct),
        total: data.total,
        max: data.max,
      });
    }
  }

  weakSubjects.sort((a, b) => a.percentage - b.percentage);
  strongSubjects.sort((a, b) => b.percentage - a.percentage);

  // Generate advice per weak subject
  const adviceList = [];
  for (const w of weakSubjects) {
    let advice = '';
    if (w.percentage < 30) {
      advice = `${w.subject} needs urgent attention. Consider hiring a tutor or arranging extra evening study sessions. Review the basics first — your child may have gaps from earlier lessons. Practice 30 minutes daily with simple exercises before moving to harder ones.`;
    } else if (w.percentage < 50) {
      advice = `${w.subject} is below average. Help your child review the topics from this week's quizzes. Ask the teacher for extra practice sheets. Set aside 20 minutes each evening for ${w.subject} practice. Praise effort, not just results.`;
    } else {
      advice = `${w.subject} is slightly below passing. With a little more practice your child can improve. Focus on the specific quiz topics where marks were lowest. Encourage your child to ask questions in class when they don't understand.`;
    }
    adviceList.push({ subject: w.subject, percentage: w.percentage, advice });
  }

  // Overall advice based on performance
  let overallAdvice = '';
  if (percentage >= 80) {
    overallAdvice = `Excellent performance! ${rank ? `Ranked #${rank} out of ${totalStudents} students. ` : ''}Your child is doing very well. Continue encouraging them and provide advanced materials to keep them challenged. Consider leadership roles in class activities.`;
  } else if (percentage >= 60) {
    overallAdvice = `Good performance! ${rank ? `Ranked #${rank} out of ${totalStudents}. ` : ''}Your child is above average. With consistent effort, they can reach the top. Focus on the weak subjects listed below and maintain the strong ones.`;
  } else if (percentage >= 50) {
    overallAdvice = `Your child is passing but has room to grow. ${rank ? `Ranked #${rank} out of ${totalStudents}. ` : ''}The weak subjects below need attention. Create a study schedule at home and check in daily on homework completion. Celebrate small improvements to build confidence.`;
  } else if (percentage > 0) {
    overallAdvice = `Your child is currently below the passing mark. ${rank ? `Ranked #${rank} out of ${totalStudents}. ` : ''}Please don't worry — with your support and the teacher's guidance, improvement is very possible. Focus on one weak subject at a time. Set small, achievable goals (e.g., "this week let's improve Math by 5 marks"). Visit the school to discuss a support plan with the teacher.`;
  } else {
    overallAdvice = `No quiz marks recorded yet this week. Encourage your child to attend all classes and complete all quizzes. Check with the teacher if there are missed assessments.`;
  }

  // Build a short text summary for in-app notifications
  let weaknessSummary = '';
  if (weakSubjects.length) {
    weaknessSummary = `Weak areas: ${weakSubjects.map(w => `${w.subject} (${w.percentage}%)`).join(', ')}. `;
    weaknessSummary += adviceList.slice(0, 2).map(a => a.advice).join(' ');
  } else if (percentage >= 50) {
    weaknessSummary = 'No weak areas detected. Your child is performing well across all subjects. Keep encouraging them!';
  }

  return {
    weakSubjects,
    strongSubjects,
    adviceList,
    overallAdvice,
    weaknessSummary,
  };
}

module.exports = { analyzeWeaknesses };
