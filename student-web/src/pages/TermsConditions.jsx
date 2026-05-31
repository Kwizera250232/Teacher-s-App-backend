import { Link } from 'react-router-dom';

export default function TermsConditions() {
  const updated = 'May 1, 2026';

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#eef1ff] via-[#f7f5ff] to-[#efeaff] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-xl shadow-indigo-100 ring-1 ring-indigo-100 sm:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Legal</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">Terms and Conditions</h1>
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
            Welcome to UClass (student.umunsi.com). These Terms and Conditions govern your access to and use of UClass,
            including student, teacher, parent, and admin features.
          </p>

          <div>
            <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p className="mt-2">
              By creating an account, accessing, or using UClass, you agree to these Terms. If you do not agree,
              please do not use the platform.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">2. Eligibility and Accounts</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Students, teachers, and admins must provide accurate account information.</li>
              <li>Users are responsible for keeping passwords secure.</li>
              <li>Student accounts may be created directly or via class join flows.</li>
              <li>Teachers are responsible for class setup and student invitation codes.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">3. Platform Use</h2>
            <p className="mt-2">UClass is for educational use, including:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Class creation and enrollment with class codes</li>
              <li>Announcements, notes, homework, and quizzes</li>
              <li>Auto-grading and performance tracking</li>
              <li>Messaging between authorized users</li>
              <li>Student learning activity and parent visibility</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">4. Prohibited Conduct</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>No harassment, abuse, hate speech, or harmful behavior.</li>
              <li>No unauthorized access, data scraping, or attempts to break security.</li>
              <li>No uploading illegal, malicious, or inappropriate content.</li>
              <li>No impersonation of teachers, students, admins, or other users.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">5. Educational Content and AI Features</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Teachers are responsible for instructional quality of uploaded materials.</li>
              <li>AI features (including assistant tools) provide guidance and do not replace teacher judgment.</li>
              <li>Users should verify important academic decisions with teachers or school leadership.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">6. Parent Visibility</h2>
            <p className="mt-2">
              UClass may provide learning progress indicators, homework status, and educational updates to support
              parents and guardians in helping children learn at home.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">7. Data and Availability</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>We work to keep services available, but uninterrupted access is not guaranteed.</li>
              <li>Features may be improved, modified, or discontinued with reasonable notice where possible.</li>
              <li>Backups and security controls are used, but users should keep important records when needed.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">8. Intellectual Property</h2>
            <p className="mt-2">
              UClass branding, interface, and software are protected by applicable intellectual property law.
              Users keep ownership of their own lawful submitted content.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">9. Account Suspension or Termination</h2>
            <p className="mt-2">
              We may suspend or terminate accounts that violate these Terms, threaten platform safety, or misuse services.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">10. Limitation of Liability</h2>
            <p className="mt-2">
              UClass is provided on an "as available" basis. To the fullest extent permitted by law, we are not liable
              for indirect or consequential damages resulting from platform use.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">11. Changes to Terms</h2>
            <p className="mt-2">
              We may update these Terms from time to time. Updated terms will be published on this page with a revised date.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">12. Contact</h2>
            <p className="mt-2">
              For terms, account, or legal questions, contact us at <a className="font-semibold text-indigo-700" href="tel:+250783450859">+250 783 450 859</a>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
