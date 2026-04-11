const AD_GIF_POOL = [
  "https://image.planet.youku.com/img/100/14/50659/i_1755166050659_77d3bd71e77407f203477debe4ba0aec_b_w150h150.gif",
  "https://wusf.cszpra.com/7669/150.gif",
  "https://image.planet.youku.com/img/100/14/68632/i_1755166068632_ad6459e936f36dea820ed54c9829f826_b_w150h150.gif",
  "https://image.planet.youku.com/img/100/1/7515/i_1772363107515_31aae2f1267f8ac779ab7d3afc52da41_b_w150h150.gif",
  "https://stanet335.top/xin-200-200-22.gif",
  "https://img.alicdn.com/imgextra/i2/4183327079/O1CN01l3kVdg22AEsRjfDsc_!!4183327079.gif",
  "https://wusf.cszpra.com/pg/446/150a.gif",
  "https://img.alicdn.com/imgextra/i1/4183327079/O1CN0143PPiT22AErkdvxMM_!!4183327079.gif",
  "https://img.cosman106.top/abc200x2005946ad5b27d11005.gif",
  "https://img.alicdn.com/imgextra/i3/2217565595682/O1CN01dpwew11rqPXkhQyzo_!!2217565595682.gif",
  "https://d1yw1n0ddlrqxj.cloudfront.net/wnsr2/150-150xin.gif",
  "https://img.alicdn.com/imgextra/i3/4183327079/O1CN01fZBm8022AErnmXfbQ_!!4183327079.gif",
  "https://img.cospu2011.top/150150.gif",
  "https://img.shsrdzs.com:7988/images/01cc6e99-2dbc-40eb-aa8f-49c63d4f1f62",
  "https://image.planet.youku.com/img/100/30/76755/i_1769753076755_3d85576e19b3a527e8d7b6eacaa736aa_b_w200h200.gif",
  "https://aa666ff999.com/b36e168328b745009c84dfacff7fefd5.gif",
  "https://image.planet.youku.com/img/100/24/14859/i_1761318114859_6a2d0277ca7639e24f68b2b586c62c1c_b_w150h150.gif"
];

function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillAdSlots() {
  const slots = Array.from(document.querySelectorAll(".ad-slot"));
  if (!slots.length) {
    return;
  }

  const picked = shuffleArray(AD_GIF_POOL).slice(0, slots.length);

  slots.forEach((slot, index) => {
    const src = picked[index % picked.length];
    slot.style.backgroundImage = `url("${src}")`;
    slot.style.backgroundSize = "cover";
    slot.style.backgroundPosition = "center";
    slot.style.backgroundRepeat = "no-repeat";
    slot.textContent = "";
    slot.href = src;
    slot.target = "_blank";
    slot.rel = "noopener noreferrer";
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", fillAdSlots);
} else {
  fillAdSlots();
}
