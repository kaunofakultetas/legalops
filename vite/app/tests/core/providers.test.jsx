// -----------------------------------------------------------
//  [*] Tests — providers.jsx, localeTheme.js, theme.js
//
//  The provider stack every page renders under:
//
//    - theme.js: the light CSS-variables theme (the brand's
//      ink, middle blue and yellow — the ink top bar, the
//      blue of the current place and of progress, the yellow
//      marker — the grey canvas under white cards, the
//      "delete" red for destructive buttons, no dark scheme)
//      and buildTheme merging the locale objects over it
//    - localeTheme.js through Providers: MUI's and the
//      DataGrid's own texts in the UI language — the Alert
//      close button, Autocomplete, Pagination, TablePagination
//      (the counted texts built from {placeholder} templates,
//      "more than" for an unknown count), Breadcrumbs, the
//      grid's overlay, footer, pagination and selection texts
//      — following a live language switch, the theme rebuilt
//      only then
//    - the CSS cascade: the layer order statement injected
//      first (the same one globals.css declares) and MUI's
//      styles, CssBaseline's included, inside @layer mui
//    - the Toaster (a polite status region) and the phone
//      navigation drawer's state shared by the navbar's menu
//      button and the sidebar
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTheme } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Pagination from '@mui/material/Pagination';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import { DataGrid } from '@mui/x-data-grid';
import toast from 'react-hot-toast';
import theme, { themeOptions, buildTheme } from '@/theme';
import Providers from '@/providers';
import { useSetLocale } from '@/i18n';
import { useNavDrawer } from '@/components/layout/NavDrawer';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import { renderPage, setLocaleCookie, authData } from '../support/render';


// Providers alone (no router — none of the samples needs one)
const mount = (ui, locale = 'en') => {
  setLocaleCookie(locale);
  const user = userEvent.setup();
  return { ...render(<Providers>{ui}</Providers>), user };
};

// Switches the language from inside the providers
function LanguageButtons() {
  const setLocale = useSetLocale();
  return (
    <>
      <button type="button" onClick={() => setLocale('lt')}>to-lt</button>
      <button type="button" onClick={() => setLocale('en')}>to-en</button>
    </>
  );
}

// A small grid: two rows, a selection column, the footer
function GridSample({ rows = [{ id: 1, name: 'Ona' }, { id: 2, name: 'Petras' }], ...props }) {
  return (
    <div style={{ height: 400, width: 800 }}>
      <DataGrid rows={rows} columns={[{ field: 'name', headerName: 'Name', width: 200 }]} {...props} />
    </div>
  );
}

// The <style> elements emotion injected, in document order
const styleTexts = () => [...document.head.querySelectorAll('style')].map((style) => style.textContent);







// -----------------------------------------------------------
// theme.js
// -----------------------------------------------------------

describe('theme.js', () => {

  it('is a light CSS-variables theme: the ink blue, the grey-blue desk under white sheets, the "delete" red', () => {
    expect(themeOptions.cssVariables).toBe(true);
    expect(theme.palette.primary.main).toBe('#173A6E');
    expect(theme.palette.primary.dark).toBe('#0F2A52');
    expect(theme.palette.primary.light).toBe('#3E6FB0');
    expect(theme.palette.background.default).toBe('#EEF1F5');
    expect(theme.palette.background.paper).toBe('#FFFFFF');
    expect(theme.palette.delete).toMatchObject({ main: '#B3261E', dark: '#8C1D17', contrastText: '#FFFFFF' });
    expect(theme.vars.palette.primary.main).toMatch(/^var\(--mui-palette-primary-main/);
    expect(theme.palette.mode).toBe('light');
    expect(Object.keys(theme.colorSchemes)).toEqual(['light']);
  });


  it('wears the brand: the mosaic\'s middle blue as secondary, its yellow as the marker, the top bar in ink', () => {
    expect(theme.palette.secondary).toMatchObject({ main: '#3E6FB0', dark: '#173A6E', light: '#8FB1E3', contrastText: '#FFFFFF' });
    expect(theme.palette.marker.main).toBe('#FFD84A');
    expect(theme.vars.palette.marker.main).toMatch(/^var\(--mui-palette-marker-main/);
    expect(themeOptions.components.MuiAppBar.styleOverrides.root).toMatchObject({ backgroundColor: '#173A6E', color: '#FFFFFF' });
  });


  it('buildTheme merges the locale objects over the base options, keeping the palette', () => {
    const built = buildTheme(
      { components: { MuiAlert: { defaultProps: { closeText: 'Uždaryti' } } } },
      { components: { MuiDataGrid: { defaultProps: { localeText: { noRowsLabel: 'Įrašų nėra' } } } } },
    );
    expect(built.components.MuiAlert.defaultProps.closeText).toBe('Uždaryti');
    expect(built.components.MuiDataGrid.defaultProps.localeText.noRowsLabel).toBe('Įrašų nėra');
    expect(built.palette.primary.main).toBe('#173A6E');
    expect(built.palette.delete.main).toBe('#B3261E');
    // The base keeps its own Alert styles and gains no locale texts
    expect(theme.components?.MuiAlert?.defaultProps).toBeUndefined();
  });
});







// -----------------------------------------------------------
// MUI core texts
// -----------------------------------------------------------

describe('localeTheme — the MUI core components\' own texts', () => {

  it.each([
    ['en', 'Close'],
    ['lt', 'Uždaryti'],
  ])('%s: the Alert close button is "%s"', (locale, close) => {
    mount(<Alert severity="info" role="status" onClose={() => {}}>Note</Alert>, locale);
    expect(within(screen.getByRole('status')).getByRole('button', { name: close })).toBeInTheDocument();
  });


  it.each([
    ['en', 'No options', 'Close'],
    ['lt', 'Pasirinkimų nėra', 'Uždaryti'],
  ])('%s: an open Autocomplete without options says "%s" and names its toggle "%s"', (locale, empty, close) => {
    mount(<Autocomplete open options={[]} renderInput={(params) => <TextField {...params} label="Field" />} />, locale);
    expect(screen.getByText(empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: close })).toBeInTheDocument();
  });


  it.each([
    ['en', 'Open', 'Clear'],
    ['lt', 'Atidaryti', 'Išvalyti'],
  ])('%s: a closed Autocomplete with a value names its toggle "%s" and its clear button "%s"', (locale, open, clear) => {
    mount(<Autocomplete options={['A', 'B']} value="A" onChange={() => {}} renderInput={(params) => <TextField {...params} label="Field" />} />, locale);
    expect(screen.getByRole('button', { name: open })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: clear, hidden: true })).toBeInTheDocument();
  });


  it.each([
    ['en', 'page 1', 'Go to page 2', 'Go to next page', 'Go to previous page'],
    ['lt', '1 puslapis', 'Eiti į 2 puslapį', 'Kitas puslapis', 'Ankstesnis puslapis'],
  ])('%s: Pagination names the current page "%s", another "%s", next and previous', (locale, current, other, next, previous) => {
    mount(<Pagination count={3} />, locale);
    expect(screen.getByRole('button', { name: current })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: other })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: next })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: previous })).toBeDisabled();
  });


  it.each([
    ['en', 'Pagination'],
    ['lt', 'Puslapiavimas'],
  ])('%s: Pagination\'s own <nav> is named "%s" instead of MUI\'s "pagination navigation" — a caller\'s name still wins', (locale, nav) => {
    mount(
      <>
        <Pagination count={3} />
        <Pagination count={2} aria-label="Search result pages" />
      </>,
      locale,
    );
    expect(screen.getByRole('navigation', { name: nav })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Search result pages' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /pagination navigation/i })).toBeNull();
  });


  it.each([
    ['en', 'Rows per page:', '1–25 of 90', '1–25 of more than 25', 'Go to next page'],
    ['lt', 'Eilučių puslapyje:', '1–25 iš 90', '1–25 iš daugiau nei 25', 'Kitas puslapis'],
  ])('%s: TablePagination labels "%s", counts "%s" (and "%s" for an unknown total)', (locale, perPage, known, unknown, next) => {
    mount(
      <>
        <TablePagination component="div" count={90} page={0} rowsPerPage={25} onPageChange={() => {}} onRowsPerPageChange={() => {}} />
        <TablePagination component="div" count={-1} page={0} rowsPerPage={25} onPageChange={() => {}} />
      </>,
      locale,
    );
    expect(screen.getAllByText(perPage).length).toBeGreaterThan(0);
    expect(screen.getByText(known)).toBeInTheDocument();
    expect(screen.getByText(unknown)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: next })).toHaveLength(2);
  });


  it.each([
    ['en', 'Show path'],
    ['lt', 'Rodyti visą kelią'],
  ])('%s: collapsed Breadcrumbs name their expander "%s"', (locale, expand) => {
    mount(
      <Breadcrumbs maxItems={2}>
        <span>Įmonės</span>
        <span>UAB Pavyzdys</span>
        <span>Dokumentai</span>
      </Breadcrumbs>,
      locale,
    );
    expect(screen.getByRole('button', { name: expand })).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// DataGrid texts
// -----------------------------------------------------------

describe('localeTheme — the DataGrid\'s own texts', () => {

  it.each([
    ['en', 'No rows'],
    ['lt', 'Įrašų nėra'],
  ])('%s: an empty grid says "%s"', async (locale, empty) => {
    mount(<GridSample rows={[]} />, locale);
    expect(await screen.findByText(empty)).toBeInTheDocument();
  });


  it.each([
    ['en', 'Rows per page:', '1–2 of 2', 'Go to next page', 'Select all rows'],
    ['lt', 'Eilučių puslapyje:', '1–2 iš 2', 'Kitas puslapis', 'Pažymėti visas eilutes'],
  ])('%s: the footer pagination and the selection column speak the language', async (locale, perPage, range, next, selectAll) => {
    mount(<GridSample checkboxSelection pageSizeOptions={[25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />, locale);
    await screen.findByText('Petras');
    expect(screen.getByText(perPage)).toBeInTheDocument();
    expect(screen.getByText(range)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: next })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: selectAll })).toBeInTheDocument();
  });


  it.each([
    ['en', 'Rows selected: 1'],
    ['lt', 'Pažymėta eilučių: 1'],
  ])('%s: a selected row is counted in the footer as "%s"', async (locale, selected) => {
    const { user } = mount(<GridSample checkboxSelection />, locale);
    await screen.findByText('Ona');
    const row = screen.getByText('Ona').closest('[role="row"]');
    await user.click(within(row).getByRole('checkbox'));
    expect(await screen.findByText(selected)).toBeInTheDocument();
  });


  it.each([
    // Lithuanian groups with a no-break space; its comma is the
    // decimal sign, so "1,500" would read as one and a half
    ['en', 'Rows selected: 1,500', '1,234 of 5,678'],
    ['lt', 'Pažymėta eilučių: 1\u00a0500', '1\u00a0234 iš 5\u00a0678'],
  ])('%s: the footer counts are grouped in the UI language, not the browser\'s — "%s"', (locale, selected, visible) => {
    let localeText = null;
    function GridTexts() {
      localeText = useTheme().components.MuiDataGrid.defaultProps.localeText;
      return null;
    }
    mount(<GridTexts />, locale);
    expect(localeText.footerRowSelected(1500)).toBe(selected);
    expect(localeText.footerTotalVisibleRows(1234, 5678)).toBe(visible);
  });


  it('selecting all of 1500 rows counts them in Lithuanian digits', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, name: `Įrašas ${i + 1}` }));
    const { user } = mount(<GridSample rows={rows} checkboxSelection />, 'lt');
    await screen.findByText('Įrašas 1');
    await user.click(screen.getByRole('checkbox', { name: 'Pažymėti visas eilutes' }));
    // Text queries collapse the no-break space into a plain one
    // (the exact character is pinned by the test above)
    expect(await screen.findByText('Pažymėta eilučių: 1 500')).toBeInTheDocument();
  });
});







// -----------------------------------------------------------
// following the locale
// -----------------------------------------------------------

describe('localeTheme — a live language switch', () => {

  it('re-translates the built-in texts at once', async () => {
    const { user } = mount(
      <>
        <LanguageButtons />
        <Alert severity="info" role="status" onClose={() => {}}>Note</Alert>
        <GridSample rows={[]} />
      </>,
    );
    expect(await screen.findByText('No rows')).toBeInTheDocument();
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'to-lt' }));
    expect(await screen.findByText('Įrašų nėra')).toBeInTheDocument();
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Uždaryti' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'to-en' }));
    expect(await screen.findByText('No rows')).toBeInTheDocument();
  });


  it('rebuilds the theme only on a switch — an ordinary re-render keeps the same theme object', async () => {
    const seen = [];
    function ThemeWatcher() {
      const current = useTheme();
      const [count, setCount] = useState(0);
      seen.push(current);
      return <button type="button" onClick={() => setCount(count + 1)}>re-render {count}</button>;
    }
    const { user } = mount(<><LanguageButtons /><ThemeWatcher /></>);
    await user.click(screen.getByRole('button', { name: 're-render 0' }));
    await user.click(screen.getByRole('button', { name: 're-render 1' }));
    expect(new Set(seen).size).toBe(1);
    await user.click(screen.getByRole('button', { name: 'to-lt' }));
    expect(new Set(seen).size).toBe(2);
    expect(seen.at(-1).components.MuiAlert.defaultProps.closeText).toBe('Uždaryti');
    expect(seen.at(-1).palette.primary.main).toBe('#173A6E');
  });
});







// -----------------------------------------------------------
// the CSS cascade
// -----------------------------------------------------------

describe('Providers — the CSS cascade', () => {

  it('injects the layer order statement before any MUI style — the same order globals.css declares', () => {
    mount(<Alert severity="info" role="status">Note</Alert>);
    const texts = styleTexts();
    const statement = texts.findIndex((text) => text.trim() === '@layer theme,base,mui,components,utilities;');
    const firstMui = texts.findIndex((text) => text.includes('@layer mui{'));
    expect(statement).toBeGreaterThanOrEqual(0);
    expect(firstMui).toBeGreaterThan(statement);

    const globals = readFileSync(join(process.cwd(), 'src', 'globals.css'), 'utf8');
    const declared = globals.match(/@layer [^;{]+;/)[0].replace(/\s+/g, '');
    expect(declared).toBe(texts[statement].trim().replace(/\s+/g, ''));
  });


  it('puts MUI\'s styles — CssBaseline\'s reset and the components\' — inside @layer mui', async () => {
    mount(<Alert severity="info" role="status">Note</Alert>);
    const texts = styleTexts();
    expect(texts.some((text) => text.startsWith('@layer mui{html{') && text.includes('box-sizing:border-box'))).toBe(true);
    const alertClass = [...screen.getByRole('status').classList].find((name) => name.startsWith('css-'));
    const alertStyles = texts.filter((text) => text.includes(`.${alertClass}`));
    expect(alertStyles.some((text) => text.startsWith(`@layer mui{.${alertClass}{`) && text.includes('background-color'))).toBe(true);
    // Outside the layer MUI leaves only an empty placeholder rule
    expect(alertStyles.filter((text) => !text.startsWith('@layer mui{')).map((text) => text.trim())).toEqual([`.${alertClass}{}`]);
  });
});







// -----------------------------------------------------------
// the Toaster and the nav drawer
// -----------------------------------------------------------

describe('Providers — the Toaster', () => {

  it('shows a toast\'s message in a polite status region', async () => {
    mount(<p>page</p>);
    act(() => { toast.success('Saved'); });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Saved');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });


  it('sits at the top centre', async () => {
    mount(<p>page</p>);
    act(() => { toast('Centred'); });
    const status = await screen.findByRole('status');
    const wrapper = status.closest('div[style*="justify-content"]');
    expect(wrapper.style.justifyContent).toBe('center');
    expect(wrapper.style.top).toBe('0px');
  });
});


describe('Providers — the phone navigation drawer', () => {

  it('shares one open flag between the navbar\'s menu button and the sidebar\'s drawer', async () => {
    const { user } = renderPage(<><Navbar authData={authData} /><Sidebar authData={authData} /></>, { route: '/users' });
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveAccessibleName('Close navigation');
    const drawer = document.getElementById('app-navigation-drawer');
    expect(drawer).not.toBeNull();
    await user.click(within(drawer).getByRole('button', { name: 'Close navigation' }));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });


  it('useNavDrawer: open / setOpen / toggle, one value object until the flag flips; an inert default outside the providers', async () => {
    const seen = [];
    function DrawerProbe() {
      const drawer = useNavDrawer();
      const [, rerender] = useState(0);
      seen.push(drawer);
      return (
        <>
          <span data-testid="open">{String(drawer.open)}</span>
          <button type="button" onClick={drawer.toggle}>toggle</button>
          <button type="button" onClick={() => drawer.setOpen(false)}>close</button>
          <button type="button" onClick={() => rerender((n) => n + 1)}>re-render</button>
        </>
      );
    }
    const { user, unmount } = mount(<DrawerProbe />);
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    await user.click(screen.getByRole('button', { name: 're-render' }));
    expect(seen.at(-1)).toBe(seen[0]);
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(seen.at(-1)).not.toBe(seen[0]);
    expect(seen.at(-1).toggle).toBe(seen[0].toggle);
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    unmount();

    render(<DrawerProbe />);
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });
});
