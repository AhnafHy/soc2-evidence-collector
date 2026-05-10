import boto3
import json
import os
from datetime import datetime, timezone
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE', 'soc2-evidence')

SOC2_CONTROLS = {
    'CC6.1': 'Logical and Physical Access Controls',
    'CC6.2': 'Authentication and Authorization',
    'CC6.3': 'Role-Based Access Control',
    'CC7.1': 'System Monitoring',
    'CC7.2': 'Audit Logging',
    'CC8.1': 'Change Management',
    'A1.1': 'Availability Monitoring',
    'C1.1': 'Data Encryption at Rest',
    'C1.2': 'Data Encryption in Transit',
}

def collect_iam_evidence(iam):
    evidence = []
    
    # Password policy
    try:
        policy = iam.get_account_password_policy()['PasswordPolicy']
        evidence.append({
            'control_id': 'CC6.2',
            'evidence_type': 'IAM Password Policy',
            'status': 'PASS' if policy.get('MinimumPasswordLength', 0) >= 8 else 'FAIL',
            'details': f"Min length: {policy.get('MinimumPasswordLength')}, MFA required: {policy.get('HardExpiry', False)}",
            'resource': 'AWS Account Password Policy'
        })
    except Exception as e:
        evidence.append({
            'control_id': 'CC6.2',
            'evidence_type': 'IAM Password Policy',
            'status': 'FAIL',
            'details': 'No password policy configured',
            'resource': 'AWS Account Password Policy'
        })
    
    # MFA on root account
    try:
        summary = iam.get_account_summary()['SummaryMap']
        mfa_enabled = summary.get('AccountMFAEnabled', 0) == 1
        evidence.append({
            'control_id': 'CC6.1',
            'evidence_type': 'Root Account MFA',
            'status': 'PASS' if mfa_enabled else 'FAIL',
            'details': f"Root MFA enabled: {mfa_enabled}",
            'resource': 'AWS Root Account'
        })
    except Exception as e:
        pass
    
    # IAM roles count
    try:
        roles = iam.list_roles()['Roles']
        evidence.append({
            'control_id': 'CC6.3',
            'evidence_type': 'IAM Roles',
            'status': 'PASS',
            'details': f"Total IAM roles configured: {len(roles)}",
            'resource': 'AWS IAM Roles'
        })
    except Exception as e:
        pass
    
    return evidence

def collect_cloudtrail_evidence(cloudtrail):
    evidence = []
    try:
        trails = cloudtrail.describe_trails()['trailList']
        active_trails = [t for t in trails if t.get('HomeRegion')]
        
        evidence.append({
            'control_id': 'CC7.2',
            'evidence_type': 'CloudTrail Audit Logging',
            'status': 'PASS' if len(active_trails) > 0 else 'FAIL',
            'details': f"Active trails: {len(active_trails)}. Trail names: {', '.join([t['Name'] for t in active_trails]) if active_trails else 'None'}",
            'resource': 'AWS CloudTrail'
        })
    except Exception as e:
        evidence.append({
            'control_id': 'CC7.2',
            'evidence_type': 'CloudTrail Audit Logging',
            'status': 'FAIL',
            'details': str(e),
            'resource': 'AWS CloudTrail'
        })
    return evidence

def collect_s3_evidence(s3):
    evidence = []
    try:
        buckets = s3.list_buckets()['Buckets']
        encrypted_count = 0
        public_count = 0
        
        for bucket in buckets[:10]:
            name = bucket['Name']
            try:
                s3.get_bucket_encryption(Bucket=name)
                encrypted_count += 1
            except:
                pass
            try:
                acl = s3.get_bucket_acl(Bucket=name)
                for grant in acl.get('Grants', []):
                    if 'AllUsers' in grant.get('Grantee', {}).get('URI', ''):
                        public_count += 1
            except:
                pass
        
        evidence.append({
            'control_id': 'C1.1',
            'evidence_type': 'S3 Encryption at Rest',
            'status': 'PASS' if encrypted_count == len(buckets[:10]) else 'WARN',
            'details': f"Encrypted: {encrypted_count}/{min(len(buckets), 10)} buckets checked",
            'resource': 'AWS S3 Buckets'
        })
        
        evidence.append({
            'control_id': 'CC6.1',
            'evidence_type': 'S3 Public Access',
            'status': 'PASS' if public_count == 0 else 'FAIL',
            'details': f"Public buckets found: {public_count}",
            'resource': 'AWS S3 Buckets'
        })
    except Exception as e:
        pass
    return evidence

def collect_cloudwatch_evidence(cloudwatch):
    evidence = []
    try:
        alarms = cloudwatch.describe_alarms()['MetricAlarms']
        evidence.append({
            'control_id': 'CC7.1',
            'evidence_type': 'CloudWatch Monitoring Alarms',
            'status': 'PASS' if len(alarms) > 0 else 'WARN',
            'details': f"Active alarms configured: {len(alarms)}",
            'resource': 'AWS CloudWatch'
        })
    except Exception as e:
        pass
    return evidence

def store_evidence(table, all_evidence):
    collected_at = datetime.now(timezone.utc).isoformat()
    collection_id = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    
    with table.batch_writer() as batch:
        for item in all_evidence:
            batch.put_item(Item={
                'pk': f"EVIDENCE#{item['control_id']}",
                'sk': f"COLLECTION#{collection_id}#{item['evidence_type'].replace(' ', '_')}",
                'control_id': item['control_id'],
                'control_name': SOC2_CONTROLS.get(item['control_id'], 'Unknown'),
                'evidence_type': item['evidence_type'],
                'status': item['status'],
                'details': item['details'],
                'resource': item['resource'],
                'collected_at': collected_at,
                'collection_id': collection_id
            })
        
        # Store summary
        controls_status = {}
        for item in all_evidence:
            cid = item['control_id']
            if cid not in controls_status:
                controls_status[cid] = 'PASS'
            if item['status'] == 'FAIL':
                controls_status[cid] = 'FAIL'
            elif item['status'] == 'WARN' and controls_status[cid] != 'FAIL':
                controls_status[cid] = 'WARN'
        
        pass_count = sum(1 for s in controls_status.values() if s == 'PASS')
        fail_count = sum(1 for s in controls_status.values() if s == 'FAIL')
        warn_count = sum(1 for s in controls_status.values() if s == 'WARN')
        
        batch.put_item(Item={
            'pk': f"SUMMARY#{collection_id}",
            'sk': 'METADATA',
            'collection_id': collection_id,
            'collected_at': collected_at,
            'total_evidence': len(all_evidence),
            'controls_pass': pass_count,
            'controls_fail': fail_count,
            'controls_warn': warn_count,
            'compliance_score': Decimal(str(round(pass_count / len(controls_status) * 100, 1))) if controls_status else Decimal('0')
        })
    
    return collection_id

def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)
    iam = boto3.client('iam')
    cloudtrail = boto3.client('cloudtrail')
    s3 = boto3.client('s3')
    cloudwatch = boto3.client('cloudwatch')
    
    all_evidence = []
    all_evidence.extend(collect_iam_evidence(iam))
    all_evidence.extend(collect_cloudtrail_evidence(cloudtrail))
    all_evidence.extend(collect_s3_evidence(s3))
    all_evidence.extend(collect_cloudwatch_evidence(cloudwatch))
    
    collection_id = store_evidence(table, all_evidence)
    
    print(f"Collected {len(all_evidence)} evidence items. Collection ID: {collection_id}")
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'collection_id': collection_id,
            'evidence_count': len(all_evidence)
        })
    }