import { Fragment } from 'react';
import type { ReactElement } from 'react';
import { Modal } from 'react-native';
import { t } from '@/i18n';
import { Icon } from './Icon';
import { Box, Row, Touchable, Txt } from './primitives';

export interface MenuItem {
  key: string;
  label: string;
  onPress: () => void;
  /** The option in use: marked selected and drawn quieter. */
  current?: boolean;
  dividerBefore?: boolean;
}

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  items: readonly MenuItem[];
  testID?: string;
}

/** A pop-up menu under the top-right of the bar. A tap outside, or Android back, closes it. */
export function Menu(props: MenuProps): ReactElement | null {
  if (!props.open) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      <Box flex={1}>
        <Box float={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          <Touchable onPress={props.onClose} accessibilityLabel={t('common.close')} fill>
            <Box flex={1} />
          </Touchable>
        </Box>
        <Box
          float={{ top: 96, right: 16 }}
          bg="surface"
          border="line"
          radius="md"
          shadow="pop"
          p={1}
          w={220}
          testID={props.testID}
        >
          {props.items.map((item) => (
            <Fragment key={item.key}>
              {item.dividerBefore ? <Box h={1} bg="line" m={1} /> : null}
              <Touchable
                onPress={item.onPress}
                accessibilityLabel={item.label}
                selected={item.current}
                pressedBg="surface2"
                radius="sm"
                pressScale={1}
              >
                <Row align="center" justify="between" gap={3} px={4} minH={48}>
                  <Txt variant="bodyBold" color={item.current ? 'ink2' : 'ink'}>
                    {item.label}
                  </Txt>
                  {item.current ? <Icon name="check" size={18} color="ink2" /> : null}
                </Row>
              </Touchable>
            </Fragment>
          ))}
        </Box>
      </Box>
    </Modal>
  );
}
