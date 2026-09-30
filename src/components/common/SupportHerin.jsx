import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Heart, Download} from 'lucide-react';
import Modal from './Modal';
import '../../styles/support.css';

const qrUrl = `${import.meta.env.BASE_URL}herin-support-qr.jpg`;

export default function SupportHerin() {
  const [open, setOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const trigger = useRef(null);
  const titleId = useId();
  const close = useCallback(() => {setOpen(false); trigger.current?.focus();}, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {document.body.style.overflow = previous;};
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="btn btn-secondary support-trigger" aria-haspopup="dialog" onClick={() => {setImageError(false); setOpen(true);}}><Heart size={17} aria-hidden="true"/>Support Herin</button>
    {open && createPortal(<Modal title="Support Herin" labelledBy={titleId} onClose={close} footer={<><button type="button" className="btn btn-secondary" onClick={close}>Close</button>{!imageError && <a className="btn btn-primary" href={qrUrl} download="Herin-support-QR.jpg"><Download size={16} aria-hidden="true"/>Save QR image</a>}</>}>
      <div className="support-content"><p className="support-intro">Enjoying Herin? Your optional support helps its creator keep building a better study space.</p>
        {imageError ? <p role="alert">The QR image could not load. Please reconnect and reopen this popup.</p> : <img className="support-qr" src={qrUrl} alt="Herin creator’s BPI InstaPay support QR. Recipient initials JB, account ending 272. Verify recipient details in your banking app before confirming." onError={() => setImageError(true)}/>}
        <p className="support-instructions">Scan with your banking app, or save the image and import it if your app supports QR photos. Check the recipient before confirming. Transfer fees may apply.</p>
        <p className="support-note">Support is completely optional. Thank you for using Herin.</p>
      </div>
    </Modal>, document.body)}
  </>;
}
