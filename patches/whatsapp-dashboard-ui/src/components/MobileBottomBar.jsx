import { Link } from 'react-router-dom';

/** Fixed bottom actions for mobile dashboards */
export default function MobileBottomBar({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <nav className={`mobile-bottom-bar${className ? ` ${className}` : ''}`} aria-label="Quick actions">
      {items.map((item) => {
        const cls = `mobile-bottom-bar__btn${item.active ? ' mobile-bottom-bar__btn--active' : ''}`;
        if (item.to) {
          return (
            <Link key={item.id} to={item.to} className={cls} onClick={item.onClick}>
              <span className="mobile-bottom-bar__icon" aria-hidden>{item.icon}</span>
              <span className="mobile-bottom-bar__label">{item.label}</span>
            </Link>
          );
        }
        return (
          <button key={item.id} type="button" className={cls} onClick={item.onClick} title={item.label}>
            <span className="mobile-bottom-bar__icon" aria-hidden>{item.icon}</span>
            <span className="mobile-bottom-bar__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
