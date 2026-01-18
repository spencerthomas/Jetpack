'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Play,
  CheckCheck,
  Square,
  FileText,
  Download,
} from 'lucide-react';
import type { Plan, PlanItem as PlanItemType } from '@jetpack-agent/shared';
import { PlanItem } from './PlanItem';
import { PlanProgress } from './PlanProgress';

interface PlanViewProps {
  plan: Plan;
  onConvert?: (itemIds: string[]) => Promise<void>;
  onRefresh?: () => void;
  showMarkdownExport?: boolean;
}

export function PlanView({
  plan,
  onConvert,
  onRefresh,
  showMarkdownExport = true,
}: PlanViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);

  // Flatten items for dependency lookup
  const allItems = useMemo(() => {
    const flat: PlanItemType[] = [];
    function flatten(items: PlanItemType[]) {
      for (const item of items) {
        flat.push(item);
        if (item.children) {
          flatten(item.children);
        }
      }
    }
    flatten(plan.items);
    return flat;
  }, [plan.items]);

  // Get all pending item IDs
  const pendingItemIds = useMemo(() => {
    return allItems.filter((item) => item.status === 'pending').map((item) => item.id);
  }, [allItems]);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(pendingItemIds));
  }, [pendingItemIds]);

  const handleSelectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleConvert = useCallback(async () => {
    if (!onConvert || selected.size === 0) return;

    setConverting(true);
    try {
      await onConvert(Array.from(selected));
      setSelected(new Set());
      onRefresh?.();
    } catch (error) {
      console.error('Failed to convert items:', error);
    } finally {
      setConverting(false);
    }
  }, [onConvert, selected, onRefresh]);

  const handleExportMarkdown = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${plan.id}?format=markdown`);
      const markdown = await res.text();

      // Download as file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${plan.title.toLowerCase().replace(/\s+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export markdown:', error);
    }
  }, [plan.id, plan.title]);

  const isExecutable =
    plan.status === 'draft' || plan.status === 'approved';
  const hasSelections = selected.size > 0;

  return (
    <div className="space-y-6">
      {/* Progress section */}
      <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-5">
        <PlanProgress plan={plan} />
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          {/* Selection controls */}
          {isExecutable && pendingItemIds.length > 0 && (
            <>
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#26262a] rounded-lg transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Select All
              </button>
              <button
                onClick={handleSelectNone}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#26262a] rounded-lg transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Clear
              </button>
              <div className="h-4 w-px bg-[#26262a]" />
              <span className="text-xs text-[#8b8b8e]">
                {selected.size} of {pendingItemIds.length} selected
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Export markdown */}
          {showMarkdownExport && (
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#26262a] rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export .md
            </button>
          )}

          {/* Convert button */}
          {isExecutable && (
            <button
              onClick={handleConvert}
              disabled={!hasSelections || converting}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasSelections && !converting
                  ? 'bg-[rgb(79,255,238)] text-black hover:bg-[rgb(79,255,238)]/90'
                  : 'bg-[#26262a] text-[#8b8b8e] cursor-not-allowed'
              }`}
            >
              <Play className="w-4 h-4" />
              {converting
                ? 'Converting...'
                : hasSelections
                ? `Execute ${selected.size} Task${selected.size !== 1 ? 's' : ''}`
                : 'Select Tasks'}
            </button>
          )}
        </div>
      </div>

      {/* Task tree */}
      <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#26262a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[rgb(79,255,238)]" />
            <span className="text-sm text-[#f7f8f8] font-medium">Plan Items</span>
            <span className="text-xs text-[#8b8b8e]">({allItems.length})</span>
          </div>
        </div>

        <div className="p-3">
          {plan.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-10 h-10 text-[#3f3f46] mb-3" />
              <p className="text-[#8b8b8e] text-sm">No items in this plan</p>
              <p className="text-[#6b6b6e] text-xs mt-1">
                Add items by editing the plan or generating from a request
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {plan.items.map((item) => (
                <PlanItem
                  key={item.id}
                  item={item}
                  selected={selected}
                  onSelect={handleSelect}
                  allItems={allItems}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plan metadata footer */}
      <div className="flex items-center justify-between text-xs text-[#6b6b6e] px-2">
        <div className="flex items-center gap-4">
          <span>ID: {plan.id}</span>
          <span>Created: {new Date(plan.createdAt).toLocaleDateString()}</span>
          {plan.estimatedTotalMinutes && (
            <span>Est: {formatMinutes(plan.estimatedTotalMinutes)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {plan.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-[#26262a]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
