import { useNavigate } from 'react-router-dom';

const ROLES = [
  {
    id: 'teacher',
    rw: 'Umwarimu',
    en: 'Teacher',
    icon: '👨‍🏫',
    desc: 'Create classes, notes, homework & quizzes',
    gradient: 'from-indigo-500 to-violet-600',
    register: '/register?role=teacher',
    login: '/login',
  },
  {
    id: 'head_teacher',
    rw: "Umuyobozi w'Ikigo",
    en: 'Head Teacher',
    icon: '🏫',
    desc: 'Lead your school, approve staff & announcements',
    gradient: 'from-sky-500 to-indigo-600',
    register: '/register?role=head_teacher',
    login: '/login',
  },
  {
    id: 'student',
    rw: 'Umunyeshuri',
    en: 'Student',
    icon: '👨‍🎓',
    desc: 'Join with class code · quizzes · homework',
    gradient: 'from-emerald-500 to-teal-600',
    register: '/register?role=student',
    login: '/login',
  },
  {
    id: 'guest',
    rw: 'Guest',
    en: 'Guest (quiz link)',
    icon: '🔗',
    desc: 'Take a shared quiz · @guest.umunsi.com',
    gradient: 'from-amber-500 to-orange-600',
    register: '/register?role=guest',
    login: '/login',
  },
];

export default function LandingRoleSignup() {
  const navigate = useNavigate();

  return (
    <section className="mt-16 animate-fade-up" style={{ animationDelay: '80ms' }}>
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">Injira / Sign up</p>
        <h2 className="font-heading mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
          Hitamo uwo uri we · Choose your role
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
          Fungura konti cyangwa winjire — teachers, head teachers, students, and guests from quiz links.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <article
            key={role.id}
            className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className={`bg-gradient-to-br ${role.gradient} px-4 py-5 text-white`}>
              <span className="text-3xl" aria-hidden="true">{role.icon}</span>
              <h3 className="font-heading mt-2 text-lg font-black leading-tight">{role.rw}</h3>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/85">{role.en}</p>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="flex-1 text-sm text-slate-600 leading-relaxed">{role.desc}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate(role.register)}
                  className="rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
                >
                  Sign up / Iyandikishe
                </button>
                <button
                  type="button"
                  onClick={() => navigate(role.login)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                >
                  Sign in / Injira
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Parents join via a link from their child. Guests need a teacher&apos;s quiz share link to unlock classes.
      </p>
    </section>
  );
}
