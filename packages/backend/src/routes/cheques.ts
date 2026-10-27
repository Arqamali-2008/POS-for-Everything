import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'cheques', managerOnly: true, searchFields: ['cheque_no', 'party_name'] });

