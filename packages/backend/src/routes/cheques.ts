import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'cheques', managerOnly: true });
