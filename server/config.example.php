<?php
declare(strict_types=1);
// Save as config.php OUTSIDE the public web root. Never commit credentials.
return [
 'legacy_dir' => '/home/ACCOUNT/domains/tafaseel-training.com/tafaseel-private',
 'origin' => 'https://attendance.tafaseel-training.com',
 'preview' => false,
 'sms_enabled' => false,
 'sms_provider' => 'taqnyat',
 'sms_token' => getenv('TAQNYAT_TOKEN') ?: '',
 'sms_sender' => getenv('TAQNYAT_SENDER') ?: '',
];
