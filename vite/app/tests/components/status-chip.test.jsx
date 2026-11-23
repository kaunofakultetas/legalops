// -----------------------------------------------------------
//  [*] Tests — StatusChip (the coloured pill for enum states)
//
//  The colour per value — the flat table (job / report
//  states, account states, roles) and every per-kind table
//  (severity, finding, applicability, obligation, the judge's
//  verification of an obligation, credential,
//  extraction, version, document status, model-call outcome,
//  prompt source, citation, heading match, the status of a
//  work product of a compliance programme, the state of an
//  action of a company's register) — the kind table
//  winning over the flat one, the neutral fallback for
//  anything unknown (a prototype name like "constructor"
//  included), the filled critical severity, and the text
//  that carries the meaning: the caller's translated label,
//  or the raw value when none is given, so the state never
//  depends on colour alone.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { renderPage } from '../support/render';
import StatusChip from '@/components/StatusChip/StatusChip';


// MUI's colour class for a Chip colour name
const colourClass = (colour) => `MuiChip-color${colour.charAt(0).toUpperCase()}${colour.slice(1)}`;

// The chip root (the label span's parent)
const chip = (text) => screen.getByText(text).closest('.MuiChip-root');

// The flat table, value → colour — a report waiting for a
// person's approval (scope_review) wears the warning tone
const FLAT = {
  queued: 'default', running: 'info', scope_review: 'warning', done: 'success', failed: 'error', cancelled: 'warning', skipped: 'default',
  active: 'success', inactive: 'default', admin: 'primary', user: 'default',
};

// Every kind table, [kind, value, colour]
const BY_KIND = [
  ['severity', 'critical', 'error'], ['severity', 'high', 'error'], ['severity', 'medium', 'warning'], ['severity', 'low', 'info'],
  ['finding', 'met', 'success'], ['finding', 'partial', 'warning'], ['finding', 'missing', 'error'],
  ['finding', 'unknown', 'default'], ['finding', 'not_applicable', 'default'],
  ['applicability', 'applies', 'primary'], ['applicability', 'uncertain', 'warning'], ['applicability', 'not_applies', 'default'],
  ['obligation', 'proposed', 'warning'], ['obligation', 'approved', 'success'], ['obligation', 'rejected', 'default'],
  ['verification', 'supported', 'default'], ['verification', 'partly', 'warning'], ['verification', 'unsupported', 'error'],
  ['verification', 'unchecked', 'default'],
  ['credential', 'claimed', 'warning'], ['credential', 'verified', 'success'],
  ['extraction', 'pending', 'default'], ['extraction', 'done', 'success'], ['extraction', 'empty', 'warning'], ['extraction', 'failed', 'error'],
  ['version', 'pending', 'default'], ['version', 'parsing', 'info'], ['version', 'embedding', 'info'], ['version', 'ready', 'success'],
  ['version', 'failed', 'error'],
  ['docStatus', 'in_force', 'success'], ['docStatus', 'not_yet_applicable', 'info'], ['docStatus', 'repealed', 'default'],
  ['outcome', 'ok', 'success'], ['outcome', 'error', 'error'], ['outcome', 'aborted', 'warning'], ['outcome', 'stopped', 'warning'],
  ['outcome', 'interrupted', 'warning'], ['outcome', 'timeout', 'error'], ['outcome', 'budget', 'error'],
  ['outcome', 'step-limit', 'warning'], ['outcome', 'empty', 'warning'], ['outcome', 'length', 'warning'],
  ['outcome', 'content-filter', 'error'],
  ['source', 'default', 'default'], ['source', 'user', 'primary'],
  ['citation', 'found', 'success'], ['citation', 'not_found', 'error'], ['citation', 'act_not_in_corpus', 'warning'],
  ['headingMatch', 'match', 'success'], ['headingMatch', 'mismatch', 'error'], ['headingMatch', 'unknown', 'default'],
  ['product', 'none', 'default'], ['product', 'queued', 'default'], ['product', 'running', 'info'], ['product', 'draft', 'primary'],
  ['product', 'approved', 'success'], ['product', 'failed', 'error'], ['product', 'cancelled', 'warning'],
  ['action', 'open', 'default'], ['action', 'in_progress', 'info'], ['action', 'late', 'warning'], ['action', 'done', 'primary'],
  ['action', 'closed', 'success'],
];







// -----------------------------------------------------------
// Colours
// -----------------------------------------------------------

describe('StatusChip colours', () => {

  it.each(Object.entries(FLAT))('flat table: %s → %s, outlined', (value, colour) => {
    renderPage(<StatusChip value={value} label={`label of ${value}`} />);
    const root = chip(`label of ${value}`);
    expect(root).toHaveClass(colourClass(colour), 'MuiChip-outlined', 'MuiChip-sizeSmall');
  });


  it.each(BY_KIND)('kind %s: %s → %s', (kind, value, colour) => {
    renderPage(<StatusChip kind={kind} value={value} label="L" />);
    expect(chip('L')).toHaveClass(colourClass(colour));
  });


  it('a kind reads its own table first: "high" severity is red, a bare "high" is neutral', () => {
    renderPage(
      <>
        <StatusChip kind="severity" value="high" label="severity high" />
        <StatusChip value="high" label="bare high" />
      </>,
    );
    expect(chip('severity high')).toHaveClass('MuiChip-colorError');
    expect(chip('bare high')).toHaveClass('MuiChip-colorDefault');
  });


  it('a value outside its kind\'s table falls back to the flat table, then to neutral', () => {
    renderPage(
      <>
        <StatusChip kind="finding" value="running" label="flat fallback" />
        <StatusChip kind="severity" value="catastrophic" label="unknown value" />
        <StatusChip kind="no-such-kind" value="done" label="unknown kind" />
      </>,
    );
    expect(chip('flat fallback')).toHaveClass('MuiChip-colorInfo');
    expect(chip('unknown value')).toHaveClass('MuiChip-colorDefault');
    expect(chip('unknown kind')).toHaveClass('MuiChip-colorSuccess');
  });


  it('only a critical severity is filled — it has to stand out in a long list', () => {
    renderPage(
      <>
        <StatusChip kind="severity" value="critical" label="Critical" />
        <StatusChip kind="severity" value="high" label="High" />
        <StatusChip value="critical" label="Bare critical" />
        <StatusChip kind="finding" value="missing" label="Missing" />
      </>,
    );
    expect(chip('Critical')).toHaveClass('MuiChip-filled');
    expect(chip('Critical')).not.toHaveClass('MuiChip-outlined');
    for (const text of ['High', 'Bare critical', 'Missing']) {
      expect(chip(text)).toHaveClass('MuiChip-outlined');
    }
  });


  it.each([
    ['constructor'], ['toString'], ['__proto__'], ['hasOwnProperty'], ['valueOf'],
  ])('a value named like an Object prototype member (%s) is just unknown: neutral, no crash', (value) => {
    renderPage(
      <>
        <StatusChip value={value} label="flat" />
        <StatusChip kind="severity" value={value} label="kinded" />
      </>,
    );
    expect(chip('flat')).toHaveClass('MuiChip-colorDefault');
    expect(chip('kinded')).toHaveClass('MuiChip-colorDefault');
  });
});







// -----------------------------------------------------------
// Text, icon and styling
// -----------------------------------------------------------

describe('StatusChip text', () => {

  it('shows the caller\'s translated label, not the machine value', () => {
    renderPage(<StatusChip value="failed" label="Nepavyko" />);
    expect(screen.getByText('Nepavyko')).toBeInTheDocument();
    expect(screen.queryByText('failed')).toBeNull();
  });


  it('falls back to the value when no label is given', () => {
    renderPage(<StatusChip value="running" />);
    expect(chip('running')).toHaveClass('MuiChip-colorInfo');
  });


  it('keeps an empty-string label empty rather than leaking the value', () => {
    const { container } = renderPage(<StatusChip value="done" label="" />);
    expect(container.querySelector('.MuiChip-label')).toHaveTextContent(/^$/);
    expect(screen.queryByText('done')).toBeNull();
  });


  it('survives a missing value and label: an empty neutral chip', () => {
    const { container } = renderPage(<StatusChip value={null} />);
    const root = container.querySelector('.MuiChip-root');
    expect(root).toHaveClass('MuiChip-colorDefault');
    expect(root).toHaveTextContent(/^$/);
  });


  it('puts the icon before the text — a state readable without colour', () => {
    renderPage(<StatusChip kind="severity" value="high" label="High" icon={<WarningAmberIcon />} />);
    const root = chip('High');
    const icon = screen.getByTestId('WarningAmberIcon');
    expect(root).toContainElement(icon);
    expect(icon).toHaveClass('MuiChip-icon');
    expect(icon.compareDocumentPosition(screen.getByText('High')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });


  it('renders unicode and markup in the label as text, and takes the caller\'s className', () => {
    const label = '💾 Ąžuolas <b>x</b>';
    const { container } = renderPage(<StatusChip value="done" label={label} className="ml-2" />);
    expect(chip(label)).toHaveClass('ml-2');
    expect(container.querySelector('b')).toBeNull();
  });


  it('is not interactive: no button, no link', () => {
    renderPage(<StatusChip value="done" label="Done" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(chip('Done')).not.toHaveAttribute('tabindex');
  });
});
