// -----------------------------------------------------------
//  [*] Tests — StatTile (one headline number)
//
//  The figure contract: the label, the value as its own
//  paragraph ("—" for a missing one, a real 0 kept), the
//  optional secondary line, status icon and symbol, the whole tile
//  as ONE link when it leads somewhere (named by everything
//  it says, followed by the router), a plain card otherwise,
//  and numbers and words of any size or script.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { renderPage } from '../support/render';
import StatTile from '@/components/charts/StatTile';







// -----------------------------------------------------------
// Figure
// -----------------------------------------------------------

describe('StatTile figure', () => {

  it('shows the label, then the value as its own paragraph, then the secondary line', () => {
    renderPage(<StatTile label="Not met" value={12} sub="of 120 findings" />);
    const value = screen.getByText('12');
    expect(value.tagName).toBe('P');
    expect(value).toHaveClass('MuiTypography-h4', 'font-semibold');
    const label = screen.getByText('Not met');
    const sub = screen.getByText('of 120 findings');
    expect(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(value.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });


  it('keeps a real zero and shows "—" for a missing value', () => {
    renderPage(
      <>
        <StatTile label="Zero" value={0} />
        <StatTile label="Null" value={null} />
        <StatTile label="Undefined" />
      </>,
    );
    const paper = (label) => screen.getByText(label).closest('.MuiPaper-root');
    expect(within(paper('Zero')).getByText('0')).toBeInTheDocument();
    expect(within(paper('Null')).getByText('—')).toBeInTheDocument();
    expect(within(paper('Undefined')).getByText('—')).toBeInTheDocument();
  });


  it('shows no secondary line without `sub`', () => {
    renderPage(<StatTile label="Reports" value={3} />);
    const paper = screen.getByText('Reports').closest('.MuiPaper-root');
    expect(paper.children).toHaveLength(2);
  });


  it('puts a status icon in front of the label, so the state reads without colour', () => {
    renderPage(<StatTile label="Failed jobs" value={2} icon={<ErrorOutlineIcon aria-hidden />} />);
    const label = screen.getByText('Failed jobs');
    expect(label).toContainElement(screen.getByTestId('ErrorOutlineIcon'));
    expect(label.firstElementChild).toBe(screen.getByTestId('ErrorOutlineIcon'));
  });


  it('sets a symbol at the end of the value\'s line, hidden from screen readers, the link named as before', () => {
    renderPage(<StatTile label="Companies" value={7} to="/companies" symbol={<BusinessOutlinedIcon />} />);
    const value = screen.getByText('7');
    const symbol = screen.getByTestId('BusinessOutlinedIcon');
    expect(value.parentElement).toBe(symbol.parentElement.parentElement);
    expect(value.compareDocumentPosition(symbol) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(symbol.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Companies 7' })).toHaveAttribute('href', '/companies');
    expect(screen.getByText('Companies')).not.toContainElement(symbol);
  });


  it('takes a preformatted value and huge numbers, and renders unicode and markup as text', () => {
    const { container } = renderPage(
      <>
        <StatTile label="Cost" value="1 234 567,89 USD" />
        <StatTile label="💾 Ąžuolas <b>x</b>" value={123456789012345} />
      </>,
    );
    expect(screen.getByText('1 234 567,89 USD')).toBeInTheDocument();
    expect(screen.getByText('123456789012345')).toBeInTheDocument();
    expect(screen.getByText('💾 Ąžuolas <b>x</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });


  it('adds the caller\'s className to the card', () => {
    renderPage(<StatTile label="Styled" value={1} className="border-l-4" />);
    expect(screen.getByText('Styled').closest('.MuiPaper-root')).toHaveClass('p-4', 'h-full', 'border-l-4');
  });
});







// -----------------------------------------------------------
// Link
// -----------------------------------------------------------

describe('StatTile link', () => {

  it('is a plain card — no link, no hover lift — without `to`', () => {
    renderPage(<StatTile label="Reports" value={3} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Reports').closest('.MuiPaper-root')).not.toHaveClass('hover:shadow-md');
  });


  it('with `to` the whole tile is one link, named by everything it says', () => {
    renderPage(<StatTile label="Not met" value={12} sub="of 120" to="/reports" />);
    const link = screen.getByRole('link', { name: 'Not met 12 of 120' });
    expect(link).toHaveAttribute('href', '/reports');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(within(link).getByText('12')).toBeInTheDocument();
    expect(link.querySelector('.MuiPaper-root')).toHaveClass('hover:-translate-y-0.5', 'hover:border-primary');
  });


  it('follows the router on click — a client-side move, never a page load', async () => {
    const { user, router } = renderPage(<StatTile label="Jobs" value={4} to="/jobs?status=failed" />, { route: '/dashboard' });
    await user.click(screen.getByRole('link'));
    expect(router.state.location.pathname).toBe('/jobs');
    expect(router.state.location.search).toBe('?status=failed');
    expect(window.location.navigations).toEqual([]);
  });


  it('is one tab stop, followed with Enter', async () => {
    const { user, router } = renderPage(<StatTile label="Jobs" value={4} to="/jobs" />, { route: '/dashboard' });
    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/jobs');
  });
});
