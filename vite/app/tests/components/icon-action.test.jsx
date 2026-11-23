// -----------------------------------------------------------
//  [*] Tests — IconAction (an icon button that says what it
//      does)
//
//  The three forms — a plain button, a router link (`to`), an
//  external link in a new tab (`href`) — each NAMED by its
//  label on the control itself (not on the tooltip's
//  wrapper), the tooltip repeating the label on hover and on
//  keyboard focus (a disabled button included: the wrapper
//  span catches the hover a disabled button never gets), a
//  disabled link falling back to a disabled button, the MUI
//  colour and size, the pass-through props, and clicks fired
//  exactly once.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, act } from '@testing-library/react';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { renderPage } from '../support/render';
import IconAction from '@/components/IconAction/IconAction';







// -----------------------------------------------------------
// The button form
// -----------------------------------------------------------

describe('IconAction button', () => {

  it('is a button named by its label, with the icon inside and no text of its own', () => {
    renderPage(<IconAction label="Edit the role" icon={<EditIcon />} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Edit the role' });
    expect(button).toHaveAttribute('aria-label', 'Edit the role');
    expect(within(button).getByTestId('EditIcon')).toBeInTheDocument();
    expect(button).toHaveTextContent(/^$/);
    // the name sits on the button — its wrapper carries none
    expect(button.parentElement).not.toHaveAttribute('aria-label');
  });


  it('fires onClick exactly once per click, with the click event', async () => {
    const onClick = vi.fn();
    const { user } = renderPage(<IconAction label="Delete" icon={<DeleteIcon />} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toHaveProperty('type', 'click');
  });


  it('works from the keyboard: one tab stop, Enter and Space both fire', async () => {
    const onClick = vi.fn();
    const { user } = renderPage(<IconAction label="Delete" icon={<DeleteIcon />} onClick={onClick} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });


  it('disabled: a disabled button that ignores clicks', async () => {
    const onClick = vi.fn();
    const { user } = renderPage(<IconAction label="Delete" icon={<DeleteIcon />} onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    await user.click(button.parentElement);
    expect(onClick).not.toHaveBeenCalled();
  });


  it('small and default-coloured unless told otherwise', () => {
    renderPage(
      <>
        <IconAction label="Plain" icon={<EditIcon />} />
        <IconAction label="Danger" icon={<DeleteIcon />} color="error" size="medium" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveClass('MuiIconButton-sizeSmall');
    expect(screen.getByRole('button', { name: 'Plain' })).not.toHaveClass('MuiIconButton-colorError');
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('MuiIconButton-sizeMedium', 'MuiIconButton-colorError');
  });


  it('passes other props to the button (menu wiring, className, edge)', () => {
    renderPage(
      <IconAction label="More" icon={<EditIcon />} aria-haspopup="menu" aria-controls="row-menu" aria-expanded="false"
                  className="ml-auto" edge="end" />,
    );
    const button = screen.getByRole('button', { name: 'More' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-controls', 'row-menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveClass('ml-auto', 'MuiIconButton-edgeEnd');
  });


  it('keeps a unicode label whole', () => {
    renderPage(<IconAction label="Ištrinti „Ąžuolas“ 💾" icon={<DeleteIcon />} />);
    expect(screen.getByRole('button', { name: 'Ištrinti „Ąžuolas“ 💾' })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// Tooltip
// -----------------------------------------------------------

describe('IconAction tooltip', () => {

  it('shows the label on hover and hides it again', async () => {
    const { user } = renderPage(<IconAction label="Open the document" icon={<EditIcon />} />);
    const button = screen.getByRole('button', { name: 'Open the document' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open the document');
    await user.unhover(button);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });


  it('shows the label on keyboard focus', async () => {
    const { user } = renderPage(<IconAction label="Open the document" icon={<EditIcon />} />);
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open the document');
    await act(async () => { screen.getByRole('button').blur(); });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });


  it('still explains a disabled button on hover — the wrapper span takes the hover', async () => {
    const { user } = renderPage(<IconAction label="Cannot delete a running job" icon={<DeleteIcon />} disabled />);
    const wrapper = screen.getByRole('button', { name: 'Cannot delete a running job' }).parentElement;
    expect(wrapper.tagName).toBe('SPAN');
    await user.hover(wrapper);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cannot delete a running job');
  });
});







// -----------------------------------------------------------
// The link forms
// -----------------------------------------------------------

describe('IconAction links', () => {

  it('`to` makes a router link, named by the label, followed without a page load', async () => {
    const { user, router } = renderPage(<IconAction label="Open the report" icon={<EditIcon />} to="/reports/r1" />, { route: '/dashboard' });
    const link = screen.getByRole('link', { name: 'Open the report' });
    expect(link).toHaveAttribute('href', '/reports/r1');
    expect(link).not.toHaveAttribute('target');
    expect(screen.queryByRole('button')).toBeNull();
    await user.click(link);
    expect(router.state.location.pathname).toBe('/reports/r1');
    expect(window.location.navigations).toEqual([]);
  });


  it('`href` makes an external link in a new tab without opener or referrer', () => {
    renderPage(<IconAction label="Open in EUR-Lex" icon={<EditIcon />} href="https://eur-lex.europa.eu/eli/reg/2023/1114/oj" />);
    const link = screen.getByRole('link', { name: 'Open in EUR-Lex' });
    expect(link).toHaveAttribute('href', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });


  it('`href` wins over `to` when both are given', () => {
    renderPage(<IconAction label="Both" icon={<EditIcon />} to="/inside" href="https://example.lt/outside" />);
    expect(screen.getByRole('link', { name: 'Both' })).toHaveAttribute('href', 'https://example.lt/outside');
  });


  it('a disabled link is a disabled button — nothing to follow', async () => {
    const onClick = vi.fn();
    const { user, router } = renderPage(
      <>
        <IconAction label="Inner" icon={<EditIcon />} to="/reports/r1" disabled onClick={onClick} />
        <IconAction label="Outer" icon={<EditIcon />} href="https://example.lt" disabled />
      </>,
      { route: '/dashboard' },
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Inner' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Outer' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Inner' }).parentElement);
    expect(onClick).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/dashboard');
  });


  it('the link forms show the tooltip too', async () => {
    const { user } = renderPage(<IconAction label="Open the report" icon={<EditIcon />} to="/reports/r1" />);
    await user.hover(screen.getByRole('link'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open the report');
  });
});
