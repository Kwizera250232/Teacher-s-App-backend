import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  const updated = 'May 1, 2026';

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#eef1ff] via-[#f7f5ff] to-[#efeaff] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-xl shadow-indigo-100 ring-1 ring-indigo-100 sm:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Legal</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">Privacy Policy</h1>
            <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
          </div>
          <Link
            to="/welcome"
            className="rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Back to Home
          </Link>
        </div>

        <section className="space-y-6 text-slate-700">
          <p>
            This Privacy Policy explains how UClass (student.umunsi.com) collects, uses, stores, and protects personal
            information for students, teachers, parents/guardians, and administrators.
          </p>

          <div>
            <h2 className="text-xl font-bold text-slate-900">1. Information We Collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account data: name, email, role, school details, profile data, and login credentials.</li>
              <li>Classroom data: class memberships, notes, announcements, homework, quiz attempts, and scores.</li>
              <li>Communication data: messages and support interactions.</li>
              <li>Technical data: device/browser details, app usage, and error logs for reliability and security.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">2. How We Use Data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>To create and manage user accounts.</li>
              <li>To provide class learning features (notes, quizzes, homework, and progress tracking).</li>
              <li>To enable teacher-student-parent communication and school oversight.</li>
              <li>To improve performance, safety, and educational quality of the platform.</li>
              <li>To support AI-powered educational assistance and app guidance features.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">3. Parent and Child Learning Context</h2>
            <p className="mt-2">
              UClass is designed to support children learning at school and at home. Parents/guardians may receive
              educational progress signals (such as homework and quiz status) to guide support activities.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">4. Legal Basis and Educational Purpose</h2>
            <p className="mt-2">
              We process data for legitimate educational operations, platform security, and school-related administration,
              in line with applicable law and school-authorized use.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">5. Data Sharing</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Data is shared with authorized users according to role (student, teacher, parent/guardian, admin).</li>
              <li>We may use trusted service providers for hosting, storage, and infrastructure operations.</li>
              <li>We do not sell personal data for advertising purposes.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">6. Data Security</h2>
            <p className="mt-2">
              We use reasonable technical and organizational safeguards (authentication, access controls,
              secure storage practices) to protect personal information.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">7. Data Retention</h2>
            <p className="mt-2">
              We retain information only as long as needed for educational service delivery, platform integrity,
              legal compliance, and dispute resolution.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">8. Your Rights</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Request access to your personal information.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion where legally permitted.</li>
              <li>Request account restriction or closure where applicable.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">9. Cookies and Similar Technologies</h2>
            <p className="mt-2">
              We may use essential cookies and local storage for login sessions, security, and basic app functionality.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">10. International Access</h2>
            <p className="mt-2">
              If the platform is accessed outside Rwanda, users acknowledge that data handling may involve systems
              located in other regions, with protections aligned to service operations.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">11. Policy Updates</h2>
            <p className="mt-2">
              This Privacy Policy may be updated over time. Changes will appear on this page with a revised date.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">12. Contact</h2>
            <p className="mt-2">
              For privacy requests or questions, contact us at <a className="font-semibold text-indigo-700" href="tel:+250783450859">+250 783 450 859</a>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
