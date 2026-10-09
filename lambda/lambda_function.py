import json
import os
import urllib.parse
import boto3
from PIL import Image
from io import BytesIO
import time

s3 = boto3.client("s3")

OUTPUT_SIZES = {
    "thumbnail": (150, 150),
    "medium": (800, 800),
    "large": (1600, 1600)
}

ALLOWED_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png"
}


MAX_FILE_SIZE = 10 * 1024 * 1024


def lambda_handler(event, context):
    print("Received S3 event:")
    print(json.dumps(event))

    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(
            record["s3"]["object"]["key"]
        )

        print(f"Processing image: s3://{bucket}/{key}")

        if not key.startswith("uploads/"):
            print(f"Skipping non-upload object: {key}")
            continue
        file_extension = os.path.splitext(key)[1].lower()

        if file_extension not in (".jpg", ".jpeg", ".png"):
            print(
                f"Skipping unsupported file type: {key} "
                f"(extension: {file_extension})"
            )
            continue
        
        start_time = time.time()

        try:
            response = s3.get_object(
                Bucket=bucket,
                Key=key
            )

            file_size = response["ContentLength"]

            if file_size > MAX_FILE_SIZE:
                print(
                    f"Skipping oversized file: {key} "
                    f"size={file_size} bytes"
                )
                continue

            image_data = response["Body"].read()

            image = Image.open(BytesIO(image_data))

            if image.format not in ALLOWED_FORMATS:
                raise ValueError(
                    f"Unsupported image format: {image.format}"
                )

            print(
                f"Image format: {image.format}, "
                f"size: {image.size}"
            )

            original_name = os.path.splitext(
                os.path.basename(key)
            )[0]

            extension = ALLOWED_FORMATS[image.format]

            for size_name, dimensions in OUTPUT_SIZES.items():
                processed_image = image.copy()
                processed_image.thumbnail(dimensions)

                output_buffer = BytesIO()

                save_format = image.format

                if save_format == "JPEG" and processed_image.mode in (
                    "RGBA",
                    "LA",
                    "P"
                ):
                    processed_image = processed_image.convert("RGB")

                processed_image.save(
                    output_buffer,
                    format=save_format,
                    optimize=True
                )

                output_buffer.seek(0)

                output_key = (
                    f"processed/{size_name}/"
                    f"{original_name}{extension}"
                )

                s3.put_object(
                    Bucket=bucket,
                    Key=output_key,
                    Body=output_buffer,
                    ContentType=response.get(
                        "ContentType",
                        f"image/{image.format.lower()}"
                    )
                )

                print(
                    f"Created: s3://{bucket}/{output_key} "
                    f"size={processed_image.size}"
                )

            processing_time = time.time() - start_time

            print(f"Successfully processed: {key} processing_time={processing_time:.2f}s")

        except Exception as error:
            print(
                f"ERROR processing {key}: "
                f"{type(error).__name__}: {error}"
            )
            continue

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Image processing completed successfully"
        })
    }
