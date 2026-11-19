import { useT } from '../i18n';
import type { RuleReport } from '../rules/biobuzz';

const ICON = { error: '✕', warn: '!', ok: '✓', info: 'i' } as const;

export function RulesBox({ rules }: { rules: RuleReport }) {
  const t = useT();
  const title = rules.alliance === 'red' ? t('rules.titleRed') : rules.alliance === 'blue' ? t('rules.titleBlue') : t('rules.title');
  return (
    <section className="panel-section rules" data-testid="rules">
      <h3>{title}</h3>
      <ul>
        {rules.issues.map((issue, i) => (
          <li key={i} className={`rule ${issue.level}`}>
            <span className="rule-icon" aria-hidden>
              {ICON[issue.level]}
            </span>
            <span>
              {issue.rule && <strong className="mono">{issue.rule} </strong>}
              {t(issue.message)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
