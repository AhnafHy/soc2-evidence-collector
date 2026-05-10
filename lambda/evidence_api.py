import boto3
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE', 'soc2-evidence')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def response(status_code, body, headers={}):
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    }
    return {
        'statusCode': status_code,
        'headers': {**default_headers, **headers},
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def get_dashboard_summary(table):
    result = table.scan(
        FilterExpression=Attr('sk').eq('METADATA')
    )
    summaries = sorted(result.get('Items', []),
                      key=lambda x: x['collected_at'], reverse=True)
    
    if not summaries:
        return {'error': 'No collections found — run the collector first'}
    
    latest = summaries[0]
    return {
        'latest_collection': {
            'collection_id': latest['collection_id'],
            'collected_at': latest['collected_at'],
            'total_evidence': int(latest['total_evidence']),
            'controls_pass': int(latest['controls_pass']),
            'controls_fail': int(latest['controls_fail']),
            'controls_warn': int(latest['controls_warn']),
            'compliance_score': float(latest['compliance_score'])
        },
        'total_collections': len(summaries)
    }

def get_controls(table):
    result = table.scan(
        FilterExpression=Attr('pk').begins_with('EVIDENCE#')
    )
    items = result.get('Items', [])
    
    controls = {}
    for item in items:
        cid = item['control_id']
        if cid not in controls:
            controls[cid] = {
                'control_id': cid,
                'control_name': item.get('control_name', ''),
                'status': item['status'],
                'evidence': [],
                'last_collected': item['collected_at']
            }
        
        controls[cid]['evidence'].append({
            'evidence_type': item['evidence_type'],
            'status': item['status'],
            'details': item['details'],
            'resource': item['resource'],
            'collected_at': item['collected_at']
        })
        
        if item['status'] == 'FAIL':
            controls[cid]['status'] = 'FAIL'
        elif item['status'] == 'WARN' and controls[cid]['status'] != 'FAIL':
            controls[cid]['status'] = 'WARN'
        
        if item['collected_at'] > controls[cid]['last_collected']:
            controls[cid]['last_collected'] = item['collected_at']
    
    return list(controls.values())

def get_evidence_by_control(table, control_id):
    result = table.query(
        KeyConditionExpression=Key('pk').eq(f"EVIDENCE#{control_id}")
    )
    return result.get('Items', [])

def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return response(200, {})
    
    table = dynamodb.Table(TABLE_NAME)
    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    path_params = event.get('pathParameters') or {}
    
    if method == 'GET' and path == '/health':
        return response(200, {'status': 'ok'})
    
    elif method == 'GET' and path == '/dashboard':
        return response(200, get_dashboard_summary(table))
    
    elif method == 'GET' and path == '/controls':
        return response(200, get_controls(table))
    
    elif method == 'GET' and '/controls/' in path:
        control_id = path.split('/controls/')[-1]
        return response(200, get_evidence_by_control(table, control_id))
    
    elif method == 'POST' and path == '/collect':
        lambda_client = boto3.client('lambda')
        lambda_client.invoke(
            FunctionName=os.environ.get('COLLECTOR_FUNCTION'),
            InvocationType='Event'
        )
        return response(202, {'message': 'Collection triggered', 'status': 'running'})
    
    return response(404, {'error': 'Endpoint not found'})