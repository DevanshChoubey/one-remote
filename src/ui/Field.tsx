import type { ReactElement } from 'react';
import { ErrorLine } from './ErrorLine';
import { Column, Input, Txt } from './primitives';
import type { InputProps } from './primitives';

export interface FieldProps extends Omit<InputProps, 'accessibilityLabel'> {
  label: string;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  error?: string | null;
  helper?: string;
  /** Bump to shake the field once (added with the motion). */
  shakeKey?: number;
}

/** A labelled input with an optional helper line and an announced error. */
export function Field(props: FieldProps): ReactElement {
  const { label, error, helper, shakeKey: _shakeKey, accessibilityLabel, ...input } = props;
  return (
    <Column gap={2}>
      <Txt variant="label" color="ink2">
        {label}
      </Txt>
      <Input {...input} accessibilityLabel={accessibilityLabel ?? label} invalid={!!error} />
      {error ? (
        <ErrorLine text={error} />
      ) : helper ? (
        <Txt variant="caption" color="ink2">
          {helper}
        </Txt>
      ) : null}
    </Column>
  );
}
