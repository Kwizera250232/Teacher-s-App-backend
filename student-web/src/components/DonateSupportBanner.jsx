import DonateButton from './DonateButton';
import './DonateSupportBanner.css';

export default function DonateSupportBanner({ compact = false }) {
  return (
    <div className={`donate-banner ${compact ? 'donate-banner-compact' : ''}`}>
      <div className="donate-banner-text">
        <strong>💛 Support UClass Education</strong>
        <p>
          Help us keep improving learning tools for Rwanda schools. Donate from <strong>500 RWF</strong> via MTN MoMo (sandbox test mode until live API keys are set).
        </p>
      </div>
      <DonateButton />
    </div>
  );
}
