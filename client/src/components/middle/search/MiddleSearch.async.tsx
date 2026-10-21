import type { OwnProps } from './MiddleSearch';

import { Bundles } from '../../../util/moduleLoader';

import useModuleLoader from '../../../hooks/useModuleLoader';

const MiddleSearchAsync = (props: OwnProps) => {
  const MiddleSearch = useModuleLoader(Bundles.Extra, 'MiddleSearch', false, true);

  return MiddleSearch ? <MiddleSearch {...props} /> : undefined;
};

export default MiddleSearchAsync;
