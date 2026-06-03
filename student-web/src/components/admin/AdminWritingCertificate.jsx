import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import umunsiLogo from '../../assets/umunsi-logo.jpg';
import umunsimediaLogo from '../../assets/umunsimedia-logo.jpg';
import CertificateReviewModal from './CertificateReviewModal';
import { downloadCertificatePdf, downloadCertificatePng } from '../../utils/certificateDownload';
import './WritingCertificate.css';

const DEFAULT_TITLE = 'UMUNSI MEDIA WRITING COMPETITION';
const DEFAULT_SUBTITLE = 'Certificate of Achievement';
const DEFAULT_BODY =
  'For outstanding achievement in the Umunsimedia writing competition organized by Umunsi.com through student.umunsi.com, empowering learners through education and creative writing.';
const DEFAULT_SIGNER = 'KWIZERA Jean de Dieu';
const DEFAULT_SIGNER_ROLE = 'Founder & CEO, Umunsi.com';
const DEFAULT_GOV_LINE = 'Government of Rwanda';

function formatCertificateDate(value) {
  if (!value) return { long: '', short: '' };
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { long: value, short: value };
  return {
    long: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    short: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WritingCertificateDocument({
  studentName,
  schoolName,
  certificateDate,
  title,
  subtitle,
  bodyText,
  signerName,
  signerRole,
  awardLabel,
  governmentLine,
}) {
  const displayName = (studentName || '').trim() || 'Student Name';
  const school = (schoolName || '').trim();
  const dates = formatCertificateDate(certificateDate);
  const gov = (governmentLine || DEFAULT_GOV_LINE).trim();

  return (
    <article className="wcert-certificate" id="writing-competition-certificate">
      <div className="wcert-frame-corner wcert-frame-corner--tl" aria-hidden />
      <div className="wcert-frame-corner wcert-frame-corner--tr" aria-hidden />
      <div className="wcert-frame-corner wcert-frame-corner--bl" aria-hidden />
      <div className="wcert-frame-corner wcert-frame-corner--br" aria-hidden />
      <div className="wcert-watermark" aria-hidden>
        UMUNS<span>I</span> MEDIA
      </div>

      <div className="wcert-inner">
        <header className="wcert-header">
          <div className="wcert-gov-block">
            <p className="wcert-republic">Republic of Rwanda</p>
            <p className="wcert-gov-line">{gov}</p>
            <div className="wcert-rwanda-strip" aria-hidden>
              <span className="wcert-rwanda-strip__b" />
              <span className="wcert-rwanda-strip__y" />
              <span className="wcert-rwanda-strip__g" />
            </div>
          </div>
          <div className="wcert-date-badge">
            <span className="wcert-date-badge__label">Date of issue</span>
            <time className="wcert-date-badge__value" dateTime={certificateDate || undefined}>
              {dates.long || '— Select date —'}
            </time>
          </div>
        </header>

        <div className="wcert-hero">
          <p className="wcert-hero-eyebrow">{DEFAULT_SUBTITLE}</p>
          <h1 className="wcert-title">{(title || DEFAULT_TITLE).trim()}</h1>
          {(subtitle || '').trim() && subtitle !== DEFAULT_SUBTITLE ? (
            <p className="wcert-title-sub">{(subtitle || '').trim()}</p>
          ) : null}
        </div>

        <div className="wcert-award-ribbon">
          <span>{(awardLabel || 'Winner').trim()}</span>
        </div>

        <p className="wcert-presented">This certificate is proudly presented to</p>
        <h2 className="wcert-student-name">{displayName}</h2>
        {school ? <p className="wcert-school">{school}</p> : null}

        <p className="wcert-body">{(bodyText || DEFAULT_BODY).trim()}</p>

        <p className="wcert-tagline">
          Presented by <strong>umunsimedia.com</strong> · Umunsi.com · student.umunsi.com
        </p>

        <div className="wcert-signature-row">
          <div className="wcert-signature-block">
            <p className="wcert-signature-line" aria-label="Signature">
              {(signerName || DEFAULT_SIGNER).trim()}
            </p>
            <div className="wcert-signature-rule" />
            <p className="wcert-signer-title">{(signerName || DEFAULT_SIGNER).trim()}</p>
            <p className="wcert-signer-role">{(signerRole || DEFAULT_SIGNER_ROLE).trim()}</p>
          </div>
          {dates.short ? (
            <div className="wcert-date-seal">
              <span className="wcert-date-seal__day">{dates.short}</span>
              <span className="wcert-date-seal__caption">Official date</span>
            </div>
          ) : null}
        </div>

        <footer className="wcert-footer-brands">
          <p className="wcert-footer-title">Education partners</p>
          <div className="wcert-footer-logos">
            <a href="https://umunsi.com" target="_blank" rel="noreferrer">
              <img src={umunsiLogo} alt="" />
              <span>umunsi.com</span>
            </a>
            <a href="https://umunsimedia.com" target="_blank" rel="noreferrer" className="wcert-footer-umunsimedia">
              <img src={umunsimediaLogo} alt="" className="wcert-umunsimedia-logo" />
              <span>umunsimedia.com</span>
            </a>
            <div className="wcert-brand-student">
              <span className="wcert-brand-icon" aria-hidden>
                🎓
              </span>
              <span>student.umunsi.com</span>
            </div>
          </div>
        </footer>
      </div>
    </article>
  );
}

export default function AdminWritingCertificate() {
  const { user } = useAuth();
  const [studentName, setStudentName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [certificateDate, setCertificateDate] = useState(todayInputValue);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);
  const [bodyText, setBodyText] = useState(DEFAULT_BODY);
  const [awardLabel, setAwardLabel] = useState('Winner');
  const [signerName, setSignerName] = useState(DEFAULT_SIGNER);
  const [signerRole, setSignerRole] = useState(DEFAULT_SIGNER_ROLE);
  const [governmentLine, setGovernmentLine] = useState(DEFAULT_GOV_LINE);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const canPrint = useMemo(() => studentName.trim().length > 0, [studentName]);
  const isAdmin = user?.role === 'admin';

  const certificateProps = useMemo(
    () => ({
      studentName,
      schoolName,
      certificateDate,
      title,
      subtitle,
      bodyText,
      signerName,
      signerRole,
      awardLabel,
      governmentLine,
    }),
    [
      studentName,
      schoolName,
      certificateDate,
      title,
      subtitle,
      bodyText,
      signerName,
      signerRole,
      awardLabel,
      governmentLine,
    ]
  );

  const handlePrint = () => {
    if (!canPrint) return;
    window.print();
  };

  const handleDownload = async (kind) => {
    if (!canPrint) return;
    setDownloadBusy(kind);
    setDownloadError('');
    try {
      const name = studentName.trim();
      if (kind === 'pdf') await downloadCertificatePdf(name);
      else await downloadCertificatePng(name);
    } catch (e) {
      setDownloadError(e.message || 'Download failed.');
    } finally {
      setDownloadBusy('');
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-card">
        <p style={{ margin: 0, color: '#64748b' }}>
          Only UClass administrators can review, download, and print writing competition certificates.
        </p>
      </div>
    );
  }

  return (
    <div className="wcert-layout">
      <div className="wcert-form-card">
        <h3>Writing competition certificate</h3>
        <p className="wcert-form-hint">
          Fill in the winner&apos;s details, review the certificate, then download (PDF/PNG) or print.
          Only administrators can use this tool.
        </p>
        {downloadError && <p className="wcert-form-error">{downloadError}</p>}

        <div className="wcert-field">
          <label htmlFor="wcert-student">Student name *</label>
          <input
            id="wcert-student"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="e.g. Marie Uwase"
          />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-school">School name (optional)</label>
          <input
            id="wcert-school"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="Leave blank if not needed"
          />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-date">Certificate date *</label>
          <input
            id="wcert-date"
            type="date"
            value={certificateDate}
            onChange={(e) => setCertificateDate(e.target.value)}
          />
          <p className="wcert-field-note">Shown on the certificate (top badge and official seal).</p>
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-gov">Government line</label>
          <input
            id="wcert-gov"
            value={governmentLine}
            onChange={(e) => setGovernmentLine(e.target.value)}
            placeholder="Government of Rwanda"
          />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-award">Award</label>
          <input
            id="wcert-award"
            value={awardLabel}
            onChange={(e) => setAwardLabel(e.target.value)}
            placeholder="Winner"
          />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-title">Competition title</label>
          <input id="wcert-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-body">Certificate text</label>
          <textarea id="wcert-body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-signer">Signature / CEO name</label>
          <input id="wcert-signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        </div>

        <div className="wcert-field">
          <label htmlFor="wcert-signer-role">Title under signature</label>
          <input id="wcert-signer-role" value={signerRole} onChange={(e) => setSignerRole(e.target.value)} />
        </div>

        <div className="wcert-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canPrint}
            onClick={() => setReviewOpen(true)}
          >
            Review certificate
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canPrint || Boolean(downloadBusy)}
            onClick={() => handleDownload('pdf')}
          >
            {downloadBusy === 'pdf' ? 'Downloading…' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canPrint || Boolean(downloadBusy)}
            onClick={() => handleDownload('png')}
          >
            {downloadBusy === 'png' ? 'Downloading…' : 'Download PNG'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={!canPrint} onClick={handlePrint}>
            Print
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setStudentName('');
              setSchoolName('');
              setCertificateDate(todayInputValue());
              setTitle(DEFAULT_TITLE);
              setSubtitle(DEFAULT_SUBTITLE);
              setBodyText(DEFAULT_BODY);
              setAwardLabel('Winner');
              setSignerName(DEFAULT_SIGNER);
              setSignerRole(DEFAULT_SIGNER_ROLE);
              setGovernmentLine(DEFAULT_GOV_LINE);
            }}
          >
            Reset form
          </button>
        </div>
      </div>

      <div className="wcert-preview-wrap">
        <p className="wcert-preview-label">Live preview (A4) — use Review for fullscreen</p>
        <WritingCertificateDocument {...certificateProps} />
      </div>

      <CertificateReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        certificateProps={certificateProps}
        studentName={studentName}
      />
    </div>
  );
}
