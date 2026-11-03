import type { ReactElement, ReactNode } from 'react';
import { Modal } from 'react-native';
import { t } from '@/i18n';
import { IconButton } from './IconButton';
import { Box, Row, Touchable, Txt } from './primitives';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

/** A bottom sheet. Android back and a tap on the scrim both close it. */
export function Sheet(props: SheetProps): ReactElement | null {
  if (!props.open) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={props.onClose}
      testID={props.testID}
      statusBarTranslucent
    >
      <Box flex={1} justify="end">
        <Box float={{ top: 0, left: 0, right: 0, bottom: 0 }} bg="scrim">
          <Touchable onPress={props.onClose} accessibilityLabel={t('common.close')} fill>
            <Box flex={1} />
          </Touchable>
        </Box>
        <Box bg="bg" topRadius="sheet" shadow="sheet" maxH="90%" py={2}>
          <Box align="center" py={2}>
            <Box w={40} h={5} radius="pill" bg="line" />
          </Box>
          <Row align="center" px={5} gap={2}>
            <Box flex={1}>
              <Txt variant="heading">{props.title}</Txt>
            </Box>
            <IconButton icon="close" label={t('common.close')} onPress={props.onClose} flat />
          </Row>
          <Box px={5} py={3} gap={3}>
            {props.children}
          </Box>
          {props.footer ? (
            <Box px={5} py={2}>
              {props.footer}
            </Box>
          ) : null}
        </Box>
      </Box>
    </Modal>
  );
}
