import { useNavigate } from 'react-router-dom';
import ClassMomentsHero from './ClassMomentsHero';
import OnlineNowStrip from './OnlineNowStrip';
import LearnFromOtherClasses from './LearnFromOtherClasses';
import ClassMomentsSocialShares from './ClassMomentsSocialShares';
import { usePresence } from '../../hooks/usePresence';

/**
 * Visible on every role dashboard: online strip, class moments hero, learn from others, social shares.
 */
export default function ClassMomentsDashboardBlock({
  token,
  userRole,
  preview,
  feedPath,
  showLearn = true,
  hideHero = false,
  showOpenAll = true,
}) {
  const navigate = useNavigate();
  const { online } = usePresence(token);

  return (
    <div className="cm-dash-block">
      <OnlineNowStrip online={online} />
      {!hideHero && <ClassMomentsHero preview={preview} feedPath={feedPath} />}
      <ClassMomentsSocialShares token={token} userRole={userRole} />
      {showLearn && <LearnFromOtherClasses token={token} userRole={userRole} />}
      {showOpenAll && (
        <button type="button" className="btn btn-primary btn-sm cm-dash-open-all" onClick={() => navigate(feedPath)}>
          Open all class moments →
        </button>
      )}
    </div>
  );
}
