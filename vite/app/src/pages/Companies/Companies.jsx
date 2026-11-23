// -----------------------------------------------------------
//  [*] Companies — the company profiles
//
//  GET /api/companies?q=&scope=own — the caller's companies;
//  an admin sees everybody's with the owner's name, and can
//  narrow to their own ("Tik mano"). The search box queries
//  the server (name or registration code) after a pause.
//  "Nauja įmonė" creates a profile with the essentials and
//  opens it; the rest is filled on the company page (or by
//  the assistant in the chat).
//
//  The search, the switch and the table's page and sort live
//  in the address (?q=…&scope=own&page=2 — replaced, never
//  pushed), so the list comes back as it was left: Back from
//  a company, its back link, a reload. A new search starts on
//  the first page.
//
//  Split into (root component last):
//
//    CreateCompanyDialog — name, code, type, country
//    CompaniesTable      — the grid
//    Toolbar             — search + "only mine"
//    Companies           — the page (default export)
// -----------------------------------------------------------

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import toast from '@/utils/toast';
import api from '@/api/client';
import { useTranslations } from '@/i18n';
import { useFormat } from '@/utils/format';
import { useErrorMessage } from '@/utils/errors';
import useDraftText from '@/hooks/useDraftText';
import useEnumLabel from '@/hooks/useEnumLabel';
import useViewParams from '@/hooks/useViewParams';
import PageLayout from '@/components/layout/PageLayout';
import UniversalModal from '@/components/UniversalModal/UniversalModal';
import ErrorState from '@/components/ErrorState/ErrorState';
import EmptyState from '@/components/EmptyState/EmptyState';
import DataTable from '@/components/DataTable/DataTable';
import { INSTITUTION_TYPES } from '@/constants/enums';







// -----------------------------------------------------------
// CreateCompanyDialog
// -----------------------------------------------------------
//
// POST /api/companies with the four essentials; success
// opens the new company's page.
//
// Used by:
//   - Companies (below)
// -----------------------------------------------------------

function CreateCompanyDialog({ open, onClose }) {

  const t = useTranslations('PAGES.companies');
  const label = useEnumLabel();
  const describe = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const blank = { name: '', registrationCode: '', institutionType: 'unknown', country: 'LT' };
  const [form, setForm] = useState(blank);
  const [tried, setTried] = useState(false);


  // An INVALID_FIELD refusal names the field by its label
  const fieldLabels = {
    name: t('CREATE.name'), registrationCode: t('CREATE.registrationCode'), institutionType: t('CREATE.institutionType'), country: t('CREATE.country'),
  };


  const errors = {};
  if (!form.name.trim()) errors.name = t('CREATE.nameRequired');
  if (!form.country.trim()) errors.country = t('CREATE.countryRequired');
  const shown = tried ? errors : {};


  const create = useMutation({
    mutationFn: async () => (await api.post('/api/companies', {
      name: form.name.trim(),
      registrationCode: form.registrationCode.trim() || null,
      institutionType: form.institutionType,
      country: form.country.trim().toUpperCase(),
    }, { silent: true })).data,
    onSuccess: (company) => {
      toast.success(t('TOASTS.created'));
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      onClose();
      navigate(`/companies/${company.id}`);
    },
  });


  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length === 0) create.mutate();
  };
  const field = (key) => ({
    value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: Boolean(shown[key]), helperText: shown[key],
  });


  return (
    <UniversalModal open={open} onClose={onClose} onSubmit={submit} title={t('CREATE.title')} busy={create.isPending}
                    confirmLabel={t('CREATE.submit')} error={create.error ? describe(create.error, { fields: fieldLabels }) : null}
                    onExited={() => { setForm(blank); setTried(false); create.reset(); }}>
      <div className="flex flex-col gap-4 pt-2">
        <TextField label={t('CREATE.name')} {...field('name')} required autoFocus />
        <TextField label={t('CREATE.registrationCode')} {...field('registrationCode')} />
        <TextField select label={t('CREATE.institutionType')} {...field('institutionType')}>
          {INSTITUTION_TYPES.map((type) => <MenuItem key={type} value={type}>{label('institutionType', type)}</MenuItem>)}
        </TextField>
        <TextField label={t('CREATE.country')} {...field('country')} required helperText={shown.country || t('CREATE.countryHint')} />
        <Typography variant="body2" color="text.secondary">{t('CREATE.note')}</Typography>
      </div>
    </UniversalModal>
  );
}







// -----------------------------------------------------------
// CompaniesTable
// -----------------------------------------------------------
//
// Name (a real link), institution type, code, country,
// owner (admins only), last update; rows click through.
//
// Used by:
//   - Companies (below)
// -----------------------------------------------------------

function CompaniesTable({ companies, loading, showOwner }) {

  const t = useTranslations('PAGES.companies');
  const label = useEnumLabel();
  const fmt = useFormat();
  const navigate = useNavigate();


  const columns = useMemo(() => [
    { field: 'name', headerName: t('COLUMNS.name'), flex: 1.3, minWidth: 200,
      renderCell: ({ row, value }) => <Link to={`/companies/${row.id}`} className="text-primary" onClick={(e) => e.stopPropagation()}>{value}</Link> },
    { field: 'institutionType', headerName: t('COLUMNS.institutionType'), flex: 1, minWidth: 180,
      valueFormatter: (value) => label('institutionType', value) },
    { field: 'registrationCode', headerName: t('COLUMNS.registrationCode'), width: 140, valueFormatter: (value) => value || '—' },
    { field: 'country', headerName: t('COLUMNS.country'), width: 90 },
    ...(showOwner ? [{ field: 'ownerName', headerName: t('COLUMNS.owner'), width: 170, valueFormatter: (value) => value || '—' }] : []),
    { field: 'updatedAt', headerName: t('COLUMNS.updated'), width: 160, valueFormatter: (value) => fmt.dateTime(value) },
  ], [t, label, fmt, showOwner]);


  return (
    <DataTable rows={companies} columns={columns} loading={loading} label={t('TITLE')} persist
               mobileHidden={['registrationCode', 'country', 'ownerName', 'updatedAt']}
               onRowClick={({ row }) => navigate(`/companies/${row.id}`)} />
  );
}







// -----------------------------------------------------------
// Toolbar
// -----------------------------------------------------------
//
// The search box and, for admins, the "only mine" switch.
//
// Used by:
//   - Companies (below)
// -----------------------------------------------------------

function Toolbar({ search, onSearch, isAdmin, own, onOwn }) {
  const t = useTranslations('PAGES.companies');
  return (
    <div className="flex items-center gap-4 flex-wrap mb-4">
      <TextField
        size="small" value={search} onChange={(e) => onSearch(e.target.value)} label={t('search')} className="w-80 max-w-full"
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />
      {isAdmin && <FormControlLabel control={<Switch checked={own} onChange={(e) => onOwn(e.target.checked)} />} label={t('onlyMine')} />}
    </div>
  );
}







// -----------------------------------------------------------
// Companies (default export)
// -----------------------------------------------------------
//
// Owns the search (typed into a draft, committed to ?q=
// after a pause), the scope switch (?scope=own, admins
// only), the list query and the create dialog.
//
// Used by:
//   - router.jsx — route /companies
// -----------------------------------------------------------

export default function Companies({ authData }) {

  const t = useTranslations('PAGES.companies');
  const navigate = useNavigate();
  const isAdmin = authData.role === 'admin';
  const [params, setView] = useViewParams();
  const q = (params.get('q') ?? '').trim();
  const own = isAdmin && params.get('scope') === 'own';
  const [search, setSearch] = useDraftText(q, (text) => setView({ q: text, page: null }));
  const [creating, setCreating] = useState(false);
  const scope = own ? 'own' : '';


  const { data: companies = [], isLoading, error, refetch } = useQuery({
    queryKey: ['companies', { q, scope }],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (q) query.set('q', q);
      if (scope) query.set('scope', scope);
      return (await api.get(`/api/companies?${query}`)).data.companies;
    },
    placeholderData: (previous) => previous,
  });


  const searching = Boolean(q || scope);


  return (
    <PageLayout authData={authData} title={t('TITLE')} subtitle={t('subtitle')}
                actions={<Button variant="contained" onClick={() => setCreating(true)}>{t('new')}</Button>}>
      <Toolbar search={search} onSearch={setSearch} isAdmin={isAdmin} own={own}
               onOwn={(checked) => setView({ scope: checked ? 'own' : null, page: null })} />
      {error && <ErrorState error={error} onRetry={refetch} title={t('loadError')} />}
      {!error && !isLoading && companies.length === 0 && (
        <EmptyState
          icon={BusinessOutlinedIcon}
          title={searching ? t('emptySearch') : t('empty')}
          text={searching ? null : t('emptyText')}
          action={searching ? null : (
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="contained" onClick={() => setCreating(true)}>{t('new')}</Button>
              <Button onClick={() => navigate('/')}>{t('toChat')}</Button>
            </div>
          )}
        />
      )}
      {!error && (isLoading || companies.length > 0) && <CompaniesTable companies={companies} loading={isLoading} showOwner={isAdmin} />}
      <CreateCompanyDialog open={creating} onClose={() => setCreating(false)} />
    </PageLayout>
  );
}
