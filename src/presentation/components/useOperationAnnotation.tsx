import { useState } from 'react';
import type { OperationRef } from '../../domain/annotation';
import { setOperationAnnotation } from '../../application/operationAnnotations';
import { useStore } from '../state/store';
import { AnnotationModal } from './AnnotationModal';

/**
 * Edit of the annotation of one operation (spec 0047, RG12): `open` shows the modal, `modal` is the element to render once in the screen.
 * The annotation changes no figure, so it is editable on a locked month too (RG6).
 */
export function useOperationAnnotation() {
  const { update } = useStore();
  const [target, setTarget] = useState<{ ref: OperationRef; label: string; initial: string } | null>(null);
  const modal = target && (
    <AnnotationModal title={`Annotation — ${target.label}`} initial={target.initial} onSave={text => update(d => void setOperationAnnotation(d, target.ref, text))} onClose={() => setTarget(null)} />
  );
  return { open: (ref: OperationRef, label: string, initial = '') => setTarget({ ref, label, initial }), modal };
}
