import React from 'react';
import { BarChart3, BookOpen, Calculator, ChevronRight, FlaskConical, History, Layers, ListChecks, TrendingUp, Users, Waves } from 'lucide-react';
import { t } from '../lib/i18n.js';
import './TradeToolsCatalog.css';

const TOOL_GROUPS = [
  {
    id: 'research', titleKey: 'trades.toolsResearch', icon: TrendingUp,
    tools: [
      { id: 'investment-comparison', titleKey: 'trades.investmentTimeMachine', descriptionKey: 'trades.timeMachineDescription', icon: History },
      { id: 'dca-lab', titleKey: 'trades.dcaLab', descriptionKey: 'trades.dcaLabDescription', icon: FlaskConical },
      { id: 'portfolio-overlap', titleKey: 'trades.portfolioOverlap', descriptionKey: 'trades.overlapDescription', icon: Layers },
      { id: 'cost', titleKey: 'trades.averagingTool', descriptionKey: 'trades.averagingDescription', icon: Calculator },
    ],
  },
  {
    id: 'review', titleKey: 'trades.toolsReview', icon: BookOpen,
    tools: [
      { id: 'records', titleKey: 'trades.tradeLog', descriptionKey: 'trades.recordsDescription', icon: ListChecks },
      { id: 'waves', titleKey: 'trades.swingLog', descriptionKey: 'trades.wavesDescription', icon: Waves },
    ],
  },
  {
    id: 'community', titleKey: 'trades.toolsCommunity', icon: Users,
    tools: [
      { id: 'competition', titleKey: 'competition.toolEntry', descriptionKey: 'trades.competitionDescription', icon: BarChart3 },
    ],
  },
];

export default function TradeToolsCatalog({ language = 'zh', onSelect }) {
  const headingId = React.useId();
  return <div className="trade-tools-catalog">
    {TOOL_GROUPS.map(group => {
      const GroupIcon = group.icon;
      return <section key={group.id} className="trade-tools-group" aria-labelledby={`${headingId}-${group.id}`}>
        <h3 id={`${headingId}-${group.id}`} className="trade-tools-category"><GroupIcon size={14} strokeWidth={1.7} aria-hidden="true" />{t(language, group.titleKey)}</h3>
        <div className="trade-tools-items">
          {group.tools.map(tool => {
            const Icon = tool.icon;
            return <button key={tool.id} type="button" data-tool-id={tool.id} className="trade-tool-card" onClick={() => onSelect(tool.id)}>
              <span className="trade-tool-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
              <span className="trade-tool-copy"><span className="trade-tool-title">{t(language, tool.titleKey)}</span><span className="trade-tool-description">{t(language, tool.descriptionKey)}</span></span>
              <ChevronRight className="trade-tool-chevron" size={15} strokeWidth={1.7} aria-hidden="true" />
            </button>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
