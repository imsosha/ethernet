import type { FC } from '../../lib/teact/teact';
import React, { memo, useEffect, useState } from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';
import AnimatedIcon from './AnimatedIcon';

import LoadingTgs from '../../assets/tgs/loading.tgs';
import styles from './EthernetSplashScreen.module.scss';

const EthernetSplashScreen: FC = () => {
  const [isShown, setIsShown] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Удаляем первичный статический слой index.html
    const instantEl = document.getElementById('ethernet-splash-instant');
    if (instantEl) {
      instantEl.remove();
    }

    // 2 секунды показа анимации
    const timer = setTimeout(() => {
      setIsFading(true);
    }, 2000);

    // Затухание и удаление из DOM
    const removeTimer = setTimeout(() => {
      setIsShown(false);
    }, 2600);

    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!isShown) return undefined;

  return (
    <div className={buildClassName(styles.root, isFading && styles.fading)}>
      <div className={styles.logoWrapper}>
        <AnimatedIcon
          tgsUrl={LoadingTgs}
          size={200}
          play
          noLoop={false}
          nonInteractive
        />
      </div>
    </div>
  );
};

export default memo(EthernetSplashScreen);
