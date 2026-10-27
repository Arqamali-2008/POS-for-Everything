import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'purchases', managerOnly: true });
