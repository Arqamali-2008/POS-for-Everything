import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'customers', managerOnly: false });
