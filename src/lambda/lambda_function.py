"""
The code is implementing a Lambda function that retrieves hosted zones
and resource record sets from Amazon Route 53 and stores
the JSON representations in an S3 bucket.
"""

import json
import boto3
import os
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
import functools
from collections.abc import Callable
from dataclasses import dataclass
from botocore.exceptions import ClientError
from datetime import datetime

logger = Logger()

route53 = boto3.client("route53")
s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET"]


@dataclass
class ExceptionToCatch:
    exception: Exception
    message: str = ""

exceptions_to_catch = [
    ExceptionToCatch(exception=ClientError, message="Client error")
]

def catch_log_raise(
    log: Logger = logger, exceptions: list[ExceptionToCatch] = []
) -> Callable:
    """
    The catch_log_raise decorator is used to wrap functions that call AWS APIs
    like route53 and s3. It catches exceptions defined in ExceptionToCatch,
    logs them, and re-raises the exception.
    This ensures errors are captured and logged without interrupting
    the normal execution flow.
    """
    def decorator(func):  
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except tuple([ex.exception for ex in exceptions]) as e:
                log.exception(f"Exception in {func.__name__}")
                exception_to_catch = [
                    ex for ex in exceptions if isinstance(e, ex.exception)
                ][0]
                log.exception(exception_to_catch.message)
                log.exception(f"Exception: {e}")
                raise e
            except Exception as e:
                log.exception(f"Exception in {func.__name__}")
                log.exception(f"Exception: {e}")
                raise e
        return wrapper
    return decorator


@catch_log_raise(exceptions=exceptions_to_catch)
def s3_put_object(s3_client: any, bucket: str, key: str, body: str):
    s3_client.put_object(Bucket=bucket, Key=key, Body=body)


@catch_log_raise(exceptions=exceptions_to_catch)
def route_53_list_hosted_zones(route_53_client: any) -> list:
    hosted_zones = route_53_client.list_hosted_zones()
    return hosted_zones


@catch_log_raise(exceptions=exceptions_to_catch)
def route_53_list_resource_record_sets(
    route_53_client: any, hosted_zone_id: str
) -> list:
    zone_records = route_53_client.list_resource_record_sets(
        HostedZoneId=hosted_zone_id
    )
    return zone_records


@catch_log_raise()
def route_53_list_put():
    """
    The route_53_list_put function iterates over all hosted zones, retrieves
    the associated record sets, and stores the JSON for each in a separate
    S3 object using meaningful keys based on the zone name.
    """
    hosted_zones = route_53_list_hosted_zones(route53)
    current_date_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    for zone in hosted_zones["HostedZones"]:
        zone_records = route_53_list_resource_record_sets(route53, zone["Id"])
        normalized_zone_name = zone["Name"].rstrip('.').replace(".", "_")
        zone_info_json_name = f"route53/{current_date_time}/{normalized_zone_name}-info.json"
        zone_info_json = json.dumps(zone)
        s3_put_object(s3, BUCKET, zone_info_json_name, zone_info_json)

        zone_records_json_name = f"route53/{current_date_time}/{normalized_zone_name}-records.json"
        zone_records_json = json.dumps(zone_records)
        s3_put_object(s3, BUCKET, zone_records_json_name, zone_records_json)


def lambda_handler(event: dict, context: LambdaContext) -> str:
    """
    The lambda_handler function is the entry point for the Lambda function.
    It retrieves the hosted zones and resource record sets from Amazon Route 53
    and stores the JSON representations in an S3 bucket.
    """

    message = "Successful execution"
    try:
        route_53_list_put()
        return {"statusCode": 200, "body": message}
    except Exception as e:
        logger.exception(f"Exception: {e}")
        message = "Execution exception"

    return {"statusCode": 500, "body": message}
