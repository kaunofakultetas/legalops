// -----------------------------------------------------------
//  [*] FileDrop — drop files here, or pick them
//
//  A dashed drop area with a real file button inside it (the
//  keyboard path). Dropping or picking hands the files to
//  `onFiles` as an array; the caller uploads and shows the
//  progress. The hidden input is reset after every pick so
//  choosing the same file twice still fires.
//
//  `accept` holds for a drop too, not only for the picker's
//  filter (which a user can also switch to "All files"): the
//  company documents are stored and counted against the quota
//  whatever their type, so a file the extractor cannot read
//  must not slip in by drag and drop. `maxSize` (bytes) is
//  the backend's per-file limit (constants/uploads.js): a
//  larger file is refused here, before any request — it used
//  to upload completely only to be answered FILE_TOO_LARGE —
//  and the hint under the button names the limit. Without
//  `maxSize` no size is judged here (the backend still does).
//
//  Refused files are not handed over; one alert under the
//  area names them and why (utils/files.js), in the UI
//  language, until the next drop or pick. Without `multiple`
//  only the first file that passes is taken.
// -----------------------------------------------------------

import { Fragment, useId, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useLocale, useTranslations } from '@/i18n';
import { describeRefused, screenFiles } from '@/utils/files';
import { useFormat } from '@/utils/format';







// -----------------------------------------------------------
// FileDrop (default export)
// -----------------------------------------------------------
//
//   <FileDrop accept=".pdf,.docx" multiple onFiles={(files) => …} hint="…" />
//   <FileDrop accept={ACT_ACCEPT} maxSize={MAX_ACT_BYTES} onFiles={…} />
//
// The hint and the limit describe the file button too, so a
// screen reader hears them with it, not only the eye.
//
// Used by:
//   - CompanyDocuments.jsx — company documents
//   - CorpusDocument.jsx, AddActDialog.jsx — act files
// -----------------------------------------------------------

export default function FileDrop({ onFiles, accept, multiple = false, disabled = false, hint, label, maxSize }) {

  const t = useTranslations('COMPONENTS.common');
  const locale = useLocale();
  const fmt = useFormat();
  const hintId = useId();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState([]);
  const described = Boolean(hint || maxSize);


  const take = (list) => {
    const files = Array.from(list || []);
    if (files.length === 0 || disabled) return;
    const screened = screenFiles(files, { accept, maxSize });
    setRefused(screened.refused);
    if (screened.accepted.length > 0) onFiles(multiple ? screened.accepted : screened.accepted.slice(0, 1));
  };


  // The default is prevented even when disabled: a file
  // dropped on a page that does not take it is OPENED by the
  // browser, leaving the app
  const drop = (event) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer?.files);
  };


  return (
    <div>
      <div
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex flex-col sm:flex-row items-center gap-3 rounded border-2 border-dashed p-4 transition-colors ${over ? 'border-primary bg-canvas' : 'border-edge'}`}
      >
        <UploadFileOutlinedIcon className="text-muted" aria-hidden />
        <div className="flex-1 text-center sm:text-left">
          <Typography variant="body2">
            {t('dropHere')}{' '}
            <Button size="small" variant="outlined" disabled={disabled} onClick={() => input.current?.click()}
                    aria-describedby={described ? hintId : undefined}>
              {label || t('chooseFile')}
            </Button>
          </Typography>
          {described && (
            <Typography id={hintId} variant="caption" color="text.secondary" className="block">
              {hint && <span className="block">{hint}</span>}
              {/* The space keeps the two apart in the button's
                  description, where the line break is lost */}
              {hint && maxSize ? ' ' : null}
              {maxSize ? <span className="block">{t('maxSize', { limit: fmt.bytes(maxSize) })}</span> : null}
            </Typography>
          )}
        </div>
        <input
          ref={input}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={(event) => { take(event.target.files); event.target.value = ''; }}
        />
      </div>
      {/* One line per reason — spaced, so the alert is read
          out as sentences, not run together */}
      {refused.length > 0 && (
        <Typography variant="caption" color="error" role="alert" className="block mt-1 [overflow-wrap:anywhere]">
          {describeRefused(refused, { accept, maxSize }, locale).map((sentence, index) => (
            <Fragment key={sentence}>{index > 0 && ' '}<span className="block">{sentence}</span></Fragment>
          ))}
        </Typography>
      )}
    </div>
  );
}
