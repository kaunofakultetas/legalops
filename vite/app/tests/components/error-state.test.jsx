// -----------------------------------------------------------
//  [*] Tests — ErrorState (a failed query, said out loud)
//
//  The red box that replaces the data when a query fails: an
//  ALERT (a failure is the one thing that stays urgent — the
//  static notes of the app are status messages), carrying
//  the translated sentence utils/errors.js maps each kind of
//  failure to (a backend code, a bare status, a proxy's HTML
//  page, a dropped connection, a timeout, a 429's wait, a
//  bug in a queryFn, nothing at all), the optional title, the
//  retry button that refetches without handing the click
//  event over, both languages and a live switch between
//  them, and the real round trip through the api client:
//  a failed GET, the retry, the data.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { renderPage } from '../support/render';
import { given, apiError } from '../support/backend/server';
import * as f from '../support/backend/fixtures';
import api from '@/api/client';
import { useSetLocale } from '@/i18n';
import ErrorState from '@/components/ErrorState/ErrorState';







// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
//
// httpError: an axios failure with an HTTP answer, the shape
// a failed useQuery hands the page. LocaleSwitch: the
// navbar's switch in miniature. UsersProbe: a page-like
// query over GET /api/users that shows ErrorState with its
// refetch — the pattern every page uses.
// -----------------------------------------------------------

const httpError = (status, data = null, headers = {}) => {
  const error = new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE');
  error.response = { status, data, headers };
  return error;
};

function LocaleSwitch({ to }) {
  const setLocale = useSetLocale();
  return <button type="button" onClick={() => setLocale(to)}>{`switch to ${to}`}</button>;
}

function UsersProbe() {
  const { data, error, refetch } = useQuery({
    queryKey: ['error-state-probe'],
    queryFn: async () => (await api.get('/api/users')).data,
  });
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load the users" />;
  if (!data) return <p>loading</p>;
  return <p>{`${data.users.length} users loaded`}</p>;
}







// -----------------------------------------------------------
// The alert and its sentence
// -----------------------------------------------------------

describe('ErrorState sentence', () => {

  it('is an alert — a failure stays urgent — carrying the translated sentence, never the code or the prose', () => {
    renderPage(<ErrorState error={httpError(404, apiError('NOT_FOUND', 'Company not found'))} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Not found — it may have been deleted.');
    expect(alert).not.toHaveTextContent('NOT_FOUND');
    expect(alert).not.toHaveTextContent('Company not found');
    expect(screen.queryByRole('status')).toBeNull();
  });


  it.each([
    ['a backend code with its own sentence', httpError(409, apiError('ALREADY_RUNNING')), 'A compliance analysis of this company is already running.'],
    ['a code without a sentence → its status sentence', httpError(409, apiError('SOMETHING_NEW')), 'This conflicts with the record\'s current state.'],
    ['500 SERVER_ERROR', httpError(500, apiError('SERVER_ERROR', 'Internal server error')), 'Server error. Try again later.'],
    ['403', httpError(403, apiError('FORBIDDEN')), 'You are not allowed to do this.'],
    ['a proxy\'s HTML page (502)', httpError(502, '<html><body><h1>502 Bad Gateway</h1></body></html>'), 'The server is temporarily unreachable. Try again.'],
    ['an empty 503', httpError(503, ''), 'The service is temporarily unavailable. Try again later.'],
    ['a 429 with Retry-After', httpError(429, apiError('RATE_LIMITED'), { 'retry-after': '30' }), 'Too many attempts. Wait a moment and try again. Try again in 30 s.'],
    ['the validation prose, verbatim in English', httpError(400, apiError('INVALID_QUERY', 'limit must be between 1 and 500')), 'limit must be between 1 and 500'],
    ['a dropped connection', new AxiosError('Network Error', 'ERR_NETWORK'), 'Could not reach the server. Check your internet connection.'],
    ['a timeout', new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED'), 'The server did not answer in time.'],
    ['a bug in a queryFn (not a network failure)', new TypeError('Cannot read properties of undefined (reading \'map\')'), 'Something unexpected went wrong.'],
    ['no error object at all', null, 'Something unexpected went wrong.'],
  ])('%s', (_, error, sentence) => {
    renderPage(<ErrorState error={error} />);
    expect(screen.getByRole('alert')).toHaveTextContent(sentence);
  });


  it('puts the title above the sentence', () => {
    renderPage(<ErrorState error={httpError(500, null)} title="Could not load the reports" />);
    const alert = screen.getByRole('alert');
    // MUI's AlertTitle: the bold first line of the message
    expect(within(alert).getByText('Could not load the reports')).toHaveClass('MuiAlertTitle-root');
    expect(alert).toHaveTextContent(/^Could not load the reportsServer error\. Try again later\.$/);
  });


  it('shows no title row without a title', () => {
    const { container } = renderPage(<ErrorState error={httpError(500, null)} />);
    expect(container.querySelector('.MuiAlertTitle-root')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Server error\. Try again later\.$/);
  });


  it('adds the caller\'s className to the alert', () => {
    renderPage(<ErrorState error={null} className="mb-4" />);
    expect(screen.getByRole('alert')).toHaveClass('MuiAlert-root', 'mb-4');
  });
});







// -----------------------------------------------------------
// Retry
// -----------------------------------------------------------

describe('ErrorState retry', () => {

  it('offers no retry without onRetry', () => {
    renderPage(<ErrorState error={httpError(500, null)} />);
    expect(screen.queryByRole('button')).toBeNull();
  });


  it('calls onRetry once, with no arguments — a refetch must not receive the click event as its options', async () => {
    const onRetry = vi.fn();
    const { user } = renderPage(<ErrorState error={httpError(500, null)} onRetry={onRetry} />);
    const retry = within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' });
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith();
  });


  it('is reachable by keyboard and fires on Enter and on Space', async () => {
    const onRetry = vi.fn();
    const { user } = renderPage(<ErrorState error={httpError(500, null)} onRetry={onRetry} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });


  it('a failed GET through the api client shows the alert; retry fetches again and the data replaces it', async () => {
    given.sequence('get', '/api/users', [
      { status: 500, body: apiError('SERVER_ERROR', 'Internal server error') },
      { body: { users: f.users } },
    ]);
    const { user } = renderPage(<UsersProbe />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the usersServer error. Try again later.');
    // A failed GET never toasts (the alert is the message)
    expect(screen.queryByRole('status')).toBeNull();

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('3 users loaded')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});







// -----------------------------------------------------------
// Languages
// -----------------------------------------------------------

describe('ErrorState languages', () => {

  it('speaks Lithuanian: the sentence, the retry button — and a validation code gets our sentence, not the English prose', () => {
    renderPage(
      <>
        <ErrorState error={httpError(404, apiError('NOT_FOUND'))} onRetry={() => {}} />
        <ErrorState error={httpError(400, apiError('INVALID_QUERY', 'limit must be between 1 and 500'))} />
      </>,
      { locale: 'lt' },
    );
    const [notFound, invalid] = screen.getAllByRole('alert');
    expect(notFound).toHaveTextContent('Įrašas nerastas — galbūt jis jau ištrintas.');
    expect(within(notFound).getByRole('button', { name: 'Bandyti dar kartą' })).toBeInTheDocument();
    expect(invalid).toHaveTextContent('Neteisingi paieškos arba filtro parametrai.');
    expect(invalid).not.toHaveTextContent('limit must be');
  });


  it('re-renders the stored failure in the new language after a live switch — both ways', async () => {
    const { user } = renderPage(
      <>
        <ErrorState error={new AxiosError('Network Error', 'ERR_NETWORK')} onRetry={() => {}} />
        <LocaleSwitch to="lt" />
        <LocaleSwitch to="en" />
      </>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not reach the server. Check your internet connection.');

    await user.click(screen.getByRole('button', { name: 'switch to lt' }));
    expect(alert).toHaveTextContent('Nepavyko susisiekti su serveriu. Patikrinkite interneto ryšį.');
    expect(within(alert).getByRole('button', { name: 'Bandyti dar kartą' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch to en' }));
    expect(alert).toHaveTextContent('Could not reach the server. Check your internet connection.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
