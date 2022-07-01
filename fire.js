require('dotenv').config({ path: '/home/hosting_users/ksiisk99/apps/ksiisk99_anyangstaxichat/firekey.env' });

const{f_type,f_project_id,f_private_key_id,f_private_key,f_client_email,f_client_id,f_auth_uri,f_token_uri,f_auth_provider_x509_cert_url,f_client_x509_cert_url}=process.env;
module.exports={
    f_key:{
        type:f_type,
        project_id:f_project_id,
        private_key_id:f_private_key_id,
        private_key:f_private_key.replace(/\\n/g,'\n'),
        client_email:f_client_email,
        client_id:f_client_id,
        auth_uri:f_auth_uri,
        token_uri:f_token_uri,
        auth_provider_x509_cert_url:f_auth_provider_x509_cert_url,
        client_x509_cert_url:f_client_x509_cert_url
    }
};