/**
 * Property-Based Test: Tool selection state invariant (Property 3)
 *
 * Feature: stem-editor-transitional-ui
 * Property 3: Tool selection state invariant
 *
 * For any sequence of tool activations (drawn from the 5 tool categories), the ToolDrawer
 * state SHALL maintain the invariant that at most one tool is active at any time. Activating
 * the currently active tool SHALL result in no active tool. Activating a different tool SHALL
 * result in exactly that tool being active.
 *
 * **Validates: Requirements 4.3, 4.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import { useToolDrawer } from './useToolDrawer';
import type { ToolCategory } from '@/types/tools';

const TOOL_CATEGORIES: ToolCategory[] = ['pitch', 'eq', 'timeStretch', 'amplitude', 'fx'];

/** Arbitrary for a single tool category */
const toolCategoryArb = fc.constantFrom<ToolCategory>(...TOOL_CATEGORIES);

/** Operation types that can be performed on the drawer */
type DrawerOp =
  | { type: 'toggle'; tool: ToolCategory }
  | { type: 'open'; tool: ToolCategory }
  | { type: 'close' };

/** Arbitrary for a drawer operation (toggle, open, or close) */
const drawerOpArb: fc.Arbitrary<DrawerOp> = fc.oneof(
  toolCategoryArb.map((tool) => ({ type: 'toggle' as const, tool })),
  toolCategoryArb.map((tool) => ({ type: 'open' as const, tool })),
  fc.constant({ type: 'close' as const }),
);

describe('Feature: stem-editor-transitional-ui, Property 3: Tool selection state invariant', () => {
  it('toggle sequences maintain at-most-one-active invariant after each step', () => {
    fc.assert(
      fc.property(
        fc.array(toolCategoryArb, { minLength: 1, maxLength: 50 }),
        (toggleSequence) => {
          const { result } = renderHook(() => useToolDrawer());

          let expectedActive: ToolCategory | null = null;

          for (const tool of toggleSequence) {
            act(() => result.current.toggle(tool));

            // Compute expected state
            if (expectedActive === tool) {
              // Toggling the active tool deactivates it
              expectedActive = null;
            } else {
              // Toggling a different (or no) tool activates it
              expectedActive = tool;
            }

            // Invariant: at most one tool is active
            const { activeTool, isOpen } = result.current;
            expect(activeTool).toBe(expectedActive);

            if (expectedActive === null) {
              expect(isOpen).toBe(false);
            } else {
              expect(isOpen).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('toggling same tool twice always results in no active tool', () => {
    fc.assert(
      fc.property(toolCategoryArb, (tool) => {
        const { result } = renderHook(() => useToolDrawer());

        act(() => result.current.toggle(tool));
        expect(result.current.activeTool).toBe(tool);
        expect(result.current.isOpen).toBe(true);

        act(() => result.current.toggle(tool));
        expect(result.current.activeTool).toBeNull();
        expect(result.current.isOpen).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('toggling a different tool always switches to exactly that tool', () => {
    fc.assert(
      fc.property(
        toolCategoryArb,
        toolCategoryArb.filter((t) => t !== TOOL_CATEGORIES[0]),
        (first, second) => {
          fc.pre(first !== second);
          const { result } = renderHook(() => useToolDrawer());

          act(() => result.current.toggle(first));
          expect(result.current.activeTool).toBe(first);

          act(() => result.current.toggle(second));
          expect(result.current.activeTool).toBe(second);
          expect(result.current.isOpen).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('mixed operations (toggle, open, close) maintain at-most-one-active invariant', () => {
    fc.assert(
      fc.property(
        fc.array(drawerOpArb, { minLength: 1, maxLength: 50 }),
        (operations) => {
          const { result } = renderHook(() => useToolDrawer());

          let expectedActive: ToolCategory | null = null;
          let expectedOpen = false;

          for (const op of operations) {
            switch (op.type) {
              case 'toggle':
                act(() => result.current.toggle(op.tool));
                if (expectedActive === op.tool) {
                  expectedActive = null;
                  expectedOpen = false;
                } else {
                  expectedActive = op.tool;
                  expectedOpen = true;
                }
                break;
              case 'open':
                act(() => result.current.open(op.tool));
                expectedActive = op.tool;
                expectedOpen = true;
                break;
              case 'close':
                act(() => result.current.close());
                expectedActive = null;
                expectedOpen = false;
                break;
            }

            // Invariant: at most one tool active at any time
            const { activeTool, isOpen } = result.current;
            expect(activeTool).toBe(expectedActive);
            expect(isOpen).toBe(expectedOpen);

            // activeTool is either null or exactly one valid ToolCategory
            if (activeTool !== null) {
              expect(TOOL_CATEGORIES).toContain(activeTool);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
