// -----------------------------------------------------------
//  [*] Chat — the conversation's company and role
//
//  The top of the company panel: which of the user's
//  companies the conversation is about (GET /api/companies —
//  the list the reports and the dashboard read too) and which
//  of that company's role profiles it adopts (the company
//  detail's roles). A pick is saved at once:
//
//    PATCH /api/chat/threads/{id}  {companyId}        — link
//                                  {companyId: null}  — unlink
//                                  {roleId}           — adopt
//                                  {roleId: null}     — drop
//
//  Django drops the role when the company changes (and on an
//  unlink), so the role picker shows what the answer says,
//  never a guess. The answer replaces the thread row in the
//  query cache — the panel and the chat header's company
//  button follow at once — and the next turn reads the new
//  company server-side (the assistant loads the thread's
//  company itself). A new conversation is created first (the
//  POST its first message would make), then linked.
//
//  The PATCH is silent: a refusal is said here, once, and the
//  pickers go back to what is saved — a company that is not
//  the user's (404), a role of another company (404),
//  anything else in the chat's own words.
//
//  An administrator is offered every user's companies, and
//  two users' companies may share a name: one that is not the
//  signed-in user's own names its owner under its name
//  (ownerName, when the list knows it), and typing the
//  owner's name finds it too. The picked company reads its
//  name alone.
//
//  Split into (root component last):
//
//    usableOptions — list rows → picker options
//    refusalText   — a failed save → its sentence
//    ownerShown    — whose company, unless the user's own
//    CompanyOption — one company in the open list
//    CompanyPicker — the company autocomplete + unlink
//    RolePicker    — the role select
//    ThreadLink    — the section (default export)
// -----------------------------------------------------------

import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAui, useAuiState } from '@assistant-ui/react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import api from '@/api/client';
import { useLocale, useTranslations } from '@/i18n';
import ErrorState from '@/components/ErrorState/ErrorState';
import IconAction from '@/components/IconAction/IconAction';
import { chatErrorInfo, describeChatError } from '@/pages/Chat/chatErrors';







// -----------------------------------------------------------
// usableOptions
// -----------------------------------------------------------
//
//   usableOptions(companies, { id, name })
//     → [{ id, name, ownerId, ownerName }, …]
//
// The rows a picker can offer and key: objects with a string
// id, the first of each id, the name as a string, and the
// owner's id and name when the row carries them as non-empty
// strings (null otherwise — a role, or a row without them).
// `current` — the thread's own company or role — is offered
// even when the list lacks it (not loaded, failed, or no
// longer the user's), so the picker can still show what is
// linked.
//
// Used by:
//   - ThreadLink (below) — the companies and the roles
// -----------------------------------------------------------

function usableOptions(list, current) {
  const options = [];
  const seen = new Set();
  for (const row of [...(Array.isArray(list) ? list : []), current]) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    options.push({
      id: row.id,
      name: typeof row.name === 'string' ? row.name : '',
      ownerId: typeof row.ownerId === 'string' && row.ownerId ? row.ownerId : null,
      ownerName: typeof row.ownerName === 'string' && row.ownerName ? row.ownerName : null,
    });
  }
  return options;
}







// -----------------------------------------------------------
// refusalText
// -----------------------------------------------------------
//
// The sentence for a save that failed: a 404 of a pick that
// names a company or a role is that pick's own sentence
// (`notFound`, a LINK key); anything else — the conversation
// could not be created, a server error, the network — reads
// as the chat banner would say it.
//
// Used by:
//   - ThreadLink (below)
// -----------------------------------------------------------

function refusalText({ error, notFound }, t, tErrors, locale) {
  if (notFound && error?.response?.status === 404) return t(notFound);
  return describeChatError(chatErrorInfo(error), tErrors, locale);
}







// -----------------------------------------------------------
// ownerShown
// -----------------------------------------------------------
//
//   ownerShown({ ownerId: 'u2', ownerName: 'Jonas' }, 'u1') → 'Jonas'
//   ownerShown({ ownerId: 'u1', ownerName: 'Rūta' }, 'u1')  → null
//
// The owner a company option names: only for a company that
// is not the signed-in user's own (an administrator's list
// holds everybody's) and only when the list knows the name.
// A row without an owner id is never taken for somebody
// else's.
//
// Used by:
//   - CompanyPicker (below) — the line under the name, and
//     what typing matches
// -----------------------------------------------------------

function ownerShown(company, userId) {
  return company.ownerId && company.ownerId !== userId ? company.ownerName : null;
}







// -----------------------------------------------------------
// CompanyOption
// -----------------------------------------------------------
//
// One company of the open list: its name and, under it,
// "Owner: …" when `owner` is given. The owner is part of the
// option's accessible name too, so two companies of one name
// are told apart by ear as well; the two lines are blocks,
// so they are read as two phrases, not glued together.
//
// Used by:
//   - CompanyPicker (below) — renderOption
// -----------------------------------------------------------

function CompanyOption({ optionProps, company, owner }) {
  const t = useTranslations('PAGES.chat.LINK');
  return (
    <li {...optionProps}>
      <div className="min-w-0">
        <div className="[overflow-wrap:anywhere]">{company.name}</div>
        {owner && <div className="text-xs text-muted [overflow-wrap:anywhere]">{t('owner', { name: owner })}</div>}
      </div>
    </li>
  );
}







// -----------------------------------------------------------
// CompanyPicker
// -----------------------------------------------------------
//
// The user's companies as an autocomplete (typing filters),
// and — while one is linked — the unlink icon beside it. The
// field cannot be cleared by itself: unlinking is the icon's
// job, said in words. Keyed by id, so two companies of one
// name stay two options; somebody else's company names its
// owner (`userId` is the signed-in user), and typing matches
// that name as well as the company's. The field itself shows
// the picked company's name alone.
//
// Used by:
//   - ThreadLink (below)
// -----------------------------------------------------------

function CompanyPicker({ options, value, loading, disabled, userId, onPick, onUnlink }) {

  const t = useTranslations('PAGES.chat.LINK');
  // The owner counts only where it is shown — the user's own
  // name would otherwise match companies with no owner line
  const filterOptions = useMemo(
    () => createFilterOptions({ stringify: (company) => [company.name, ownerShown(company, userId)].filter(Boolean).join(' ') }),
    [userId],
  );


  return (
    <div className="flex items-center gap-1">
      <Autocomplete
        size="small" className="flex-1 min-w-0" disableClearable
        options={options} value={value} loading={loading} disabled={disabled}
        onChange={(_, company) => onPick(company)}
        getOptionLabel={(company) => company.name}
        getOptionKey={(company) => company.id}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        filterOptions={filterOptions}
        renderOption={({ key, ...optionProps }, company) => (
          <CompanyOption key={key} optionProps={optionProps} company={company} owner={ownerShown(company, userId)} />
        )}
        noOptionsText={options.length ? undefined : t('noCompanies')}
        renderInput={(params) => <TextField {...params} label={t('company')} placeholder={t('companyPlaceholder')} />}
      />
      {value && <IconAction label={t('unlink')} icon={<LinkOffIcon fontSize="small" />} onClick={onUnlink} disabled={disabled} />}
    </div>
  );
}







// -----------------------------------------------------------
// RolePicker
// -----------------------------------------------------------
//
// "No role" or one of the linked company's role profiles;
// a company without any leaves the select disabled on "No
// role".
//
// Used by:
//   - ThreadLink (below)
// -----------------------------------------------------------

function RolePicker({ options, value, disabled, onPick }) {
  const t = useTranslations('PAGES.chat.LINK');
  return (
    <TextField select size="small" fullWidth label={t('role')} value={value ?? ''}
               disabled={disabled || options.length === 0} onChange={(event) => onPick(event.target.value || null)}
               slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
      <MenuItem value="">{t('noRole')}</MenuItem>
      {options.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
    </TextField>
  );
}







// -----------------------------------------------------------
// ThreadLink (default export)
// -----------------------------------------------------------
//
//   <ThreadLink row={thread.data} company={company.data} userId={userId} />
//
// `row` is the open conversation's row (undefined for a new
// conversation), `company` the linked company's detail (its
// roles), `userId` the signed-in user's id (whose companies
// need no owner line). While a save runs the pickers show
// the pick and wait; a failure puts the saved values back
// and says why. The panel keys it by the conversation, so a
// switch starts clean.
//
// Used by:
//   - CompanyPanel.jsx — the top of the panel
// -----------------------------------------------------------

export default function ThreadLink({ row, company, userId }) {

  const t = useTranslations('PAGES.chat.LINK');
  const tErrors = useTranslations('PAGES.chat.ERRORS');
  const locale = useLocale();
  const aui = useAui();
  const queryClient = useQueryClient();
  const headingId = useId();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);


  // The same query (key and answer) as the reports and the
  // dashboard
  const companies = useQuery({
    queryKey: ['companies', { q: '', scope: '' }],
    queryFn: async () => (await api.get('/api/companies')).data.companies,
  });


  const linkedId = typeof row?.companyId === 'string' && row.companyId ? row.companyId : null;
  const linkedName = row?.companyName;
  const linked = linkedId ? { id: linkedId, name: linkedName } : null;
  const role = typeof row?.roleId === 'string' && row.roleId ? { id: row.roleId, name: row.role?.name } : null;
  // Kept by reference between renders: the autocomplete puts
  // its text back to the value's label whenever the value is
  // a new object — a re-render would wipe what the user typed
  const companyOptions = useMemo(
    () => usableOptions(companies.data, linkedId ? { id: linkedId, name: linkedName } : null),
    [companies.data, linkedId, linkedName],
  );
  const roleOptions = usableOptions(linked && company?.id === linked.id ? company.roles : null, role);
  // While a save runs the pickers show the pick (`pending`)
  const shownCompany = pending && 'company' in pending ? pending.company
    : (companyOptions.find((option) => option.id === linked?.id) ?? null);
  const shownRole = pending && 'role' in pending ? pending.role : (role?.id ?? null);


  // PATCHes the row and puts Django's answer in its cache.
  // A read of the row still under way (a conversation just
  // created is read at once) is cancelled first, or it would
  // bring the old link back after the answer
  const save = async (body, shown, notFound) => {
    setPending(shown);
    setFailure(null);
    try {
      const id = remoteId ?? (await aui.threadListItem().initialize()).remoteId;
      const { data } = await api.patch(`/api/chat/threads/${encodeURIComponent(id)}`, body, { silent: true });
      const key = ['chat', 'thread', id];
      await queryClient.cancelQueries({ queryKey: key });
      if (data && typeof data === 'object' && data.id === id) queryClient.setQueryData(key, data);
      else await queryClient.invalidateQueries({ queryKey: key });
      // The company pages list the conversations by company
      queryClient.invalidateQueries({ queryKey: ['chatThreads'] });
    } catch (error) {
      setFailure({ error, notFound });
    } finally {
      setPending(null);
    }
  };


  const pickCompany = (option) => {
    if (option && option.id !== linked?.id) save({ companyId: option.id }, { company: option }, 'companyNotFound');
  };


  const pickRole = (roleId) => {
    if (roleId !== (role?.id ?? null)) save({ roleId }, { role: roleId }, roleId ? 'roleNotFound' : null);
  };


  return (
    <section aria-labelledby={headingId} aria-busy={Boolean(pending)} className="px-4 py-3 border-b border-edge flex flex-col gap-3">
      <Typography variant="overline" component="h3" id={headingId} className="text-muted block leading-6">{t('title')}</Typography>
      <CompanyPicker options={companyOptions} value={shownCompany} loading={companies.isLoading} disabled={Boolean(pending)}
                     userId={userId} onPick={pickCompany} onUnlink={() => save({ companyId: null }, { company: null }, null)} />
      {companies.isError && (
        <ErrorState error={companies.error} title={t('companiesFailed')} onRetry={() => companies.refetch()} />
      )}

      {/* The role belongs to the linked company — none without one */}
      {linked && shownCompany?.id === linked.id && (
        <RolePicker options={roleOptions} value={shownRole} disabled={Boolean(pending)} onPick={pickRole} />
      )}

      {pending && <LinearProgress aria-label={t('saving')} />}
      {failure && (
        <Alert severity="error">
          <AlertTitle>{t('failed')}</AlertTitle>
          {refusalText(failure, t, tErrors, locale)}
        </Alert>
      )}
    </section>
  );
}
