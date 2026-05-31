import umunsiLogo from '../assets/umunsi-logo.jpg';
import umunsimediaLogo from '../assets/umunsimedia-logo.jpg';
import { useInstallPrompt } from './InstallPrompt';

export default function Footer() {
  const { canInstall, triggerInstall } = useInstallPrompt();

  return (
    <footer className="app-footer">
      <div className="footer-inner">

        <div className="footer-brands">
          <div className="footer-brands-title">Our Brands</div>
          <div className="footer-brands-list">
            <a href="https://umunsi.com" target="_blank" rel="noreferrer" className="footer-brand-item">
              <img src={umunsiLogo} alt="Umunsi.com" className="footer-brand-logo" />
              <span>Umunsi.com</span>
            </a>
            <a href="https://umunsimedia.com" target="_blank" rel="noreferrer" className="footer-brand-item">
              <img src={umunsimediaLogo} alt="Umunsimedia.com" className="footer-brand-logo" />
              <span>Umunsimedia.com</span>
            </a>
            <div className="footer-brand-item footer-brand-uclass">
              <div className="footer-uclass-icon">🎓</div>
              <span>U-Class</span>
            </div>
          </div>

          {canInstall && (
            <button className="footer-install-btn" onClick={triggerInstall}>
              <span className="footer-install-icon">🎓</span>
              <span>Install UClass App</span>
            </button>
          )}
        </div>

        <div className="footer-contact">
          <div className="footer-contact-title">Contact</div>
          <a href="tel:+250783450859" className="footer-contact-num">📞 0783450859</a>
        </div>

      </div>

      <div className="footer-powered">
        <img src={umunsiLogo} alt="Umunsi.com" className="footer-powered-logo" />
        <span>Powered by <a href="https://umunsi.com" target="_blank" rel="noreferrer">Umunsi.com</a></span>
      </div>
    </footer>
  );
}
