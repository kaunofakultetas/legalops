// -----------------------------------------------------------
//  [*] Tests — SectionCard (the titled white card)
//
//  The one card shape of the detail pages: a <section> that
//  becomes a named region through its h2 title (and stays a
//  plain, nameless section without one), the subtitle under
//  the title, the actions on the right, the header row only
//  when there is something to put in it, the body with its
//  own className, one heading id per card, and titles of any
//  shape rendered as text.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import Button from '@mui/material/Button';
import { renderPage } from '../support/render';
import SectionCard from '@/components/SectionCard/SectionCard';







// -----------------------------------------------------------
// Naming
// -----------------------------------------------------------

describe('SectionCard naming', () => {

  it('is a region landmark named by its h2 title', () => {
    renderPage(<SectionCard title="Credentials"><p>the list</p></SectionCard>);
    const region = screen.getByRole('region', { name: 'Credentials' });
    expect(region.tagName).toBe('SECTION');
    const heading = within(region).getByRole('heading', { level: 2, name: 'Credentials' });
    expect(region).toHaveAttribute('aria-labelledby', heading.id);
    expect(within(region).getByText('the list')).toBeInTheDocument();
  });


  it('without a title it is a plain section: no name, no landmark, no heading', () => {
    const { container } = renderPage(<SectionCard><p>just a body</p></SectionCard>);
    const section = container.querySelector('section');
    expect(section).not.toHaveAttribute('aria-labelledby');
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(within(section).getByText('just a body')).toBeInTheDocument();
  });


  it('gives every card its own heading id, so two cards on a page keep their own names', () => {
    renderPage(
      <>
        <SectionCard title="Basic data"><p>a</p></SectionCard>
        <SectionCard title="Activities"><p>b</p></SectionCard>
      </>,
    );
    const basic = screen.getByRole('region', { name: 'Basic data' });
    const activities = screen.getByRole('region', { name: 'Activities' });
    expect(basic.getAttribute('aria-labelledby')).not.toBe(activities.getAttribute('aria-labelledby'));
    expect(within(basic).getByText('a')).toBeInTheDocument();
    expect(within(activities).getByText('b')).toBeInTheDocument();
  });


  it('a title given as an element names the region by its text', () => {
    renderPage(<SectionCard title={<span>Reports <em>(3)</em></span>}><p>x</p></SectionCard>);
    expect(screen.getByRole('region', { name: 'Reports (3)' })).toBeInTheDocument();
  });


  it('renders markup and unicode in the title as text', () => {
    const title = '💾 Ąžuolas <script>alert(1)</script>';
    const { container } = renderPage(<SectionCard title={title}><p>x</p></SectionCard>);
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});







// -----------------------------------------------------------
// Header row and body
// -----------------------------------------------------------

describe('SectionCard layout', () => {

  it('shows the subtitle under the title and the actions after them', async () => {
    const onAdd = vi.fn();
    const { user } = renderPage(
      <SectionCard title="Roles" subtitle="Who does what" actions={<Button onClick={onAdd}>Add role</Button>}>
        <p>body</p>
      </SectionCard>,
    );
    const region = screen.getByRole('region', { name: 'Roles' });
    const heading = within(region).getByRole('heading', { level: 2 });
    const subtitle = within(region).getByText('Who does what');
    const add = within(region).getByRole('button', { name: 'Add role' });
    expect(heading.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(subtitle.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the subtitle is plain text, not a second heading
    expect(within(region).getAllByRole('heading')).toHaveLength(1);
    await user.click(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });


  it('keeps the header row for actions without a title', () => {
    const { container } = renderPage(<SectionCard actions={<Button>Compare</Button>}><p>body</p></SectionCard>);
    const section = container.querySelector('section');
    expect(within(section).getByRole('button', { name: 'Compare' })).toBeInTheDocument();
    expect(within(section).queryByRole('heading')).toBeNull();
    // header row + body
    expect(section.children).toHaveLength(2);
  });


  it('has no header row at all without title and actions — only the body', () => {
    const { container } = renderPage(<SectionCard subtitle="ignored without a title row"><p>body</p></SectionCard>);
    const section = container.querySelector('section');
    expect(section.children).toHaveLength(1);
    expect(section).toHaveTextContent(/^body$/);
  });


  it('adds className to the card and bodyClassName to the body only', () => {
    const { container } = renderPage(
      <SectionCard title="Styled" className="mt-6" bodyClassName="grid gap-2"><p>body</p></SectionCard>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveClass('MuiPaper-root', 'p-4', 'mt-6');
    expect(section).not.toHaveClass('grid');
    const body = within(section).getByText('body').parentElement;
    expect(body).toHaveClass('grid', 'gap-2');
    expect(body).not.toHaveClass('mt-6');
  });


  it('lets a long title wrap next to the actions instead of pushing them out', () => {
    const long = 'Ilgas skyriaus pavadinimas '.repeat(12).trim();
    renderPage(<SectionCard title={long} actions={<Button>Act</Button>}><p>x</p></SectionCard>);
    // No layout in jsdom — the flex classes are the witness:
    // the title column may shrink, the row may wrap
    const heading = screen.getByRole('heading', { level: 2, name: long });
    expect(heading.parentElement).toHaveClass('min-w-0');
    expect(heading.parentElement.parentElement).toHaveClass('flex', 'flex-wrap', 'justify-between');
  });
});
