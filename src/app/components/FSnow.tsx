"use client"

import { useCallback } from 'react'
import Particles from 'react-tsparticles'
import { loadSlim } from 'tsparticles-slim'

export function FSnow() {
  const init = useCallback(async (engine: any) => {
    await loadSlim(engine)
  }, [])

  return(
    <div className='z-90'>
      <Particles options={{
        particles: {
          color: {
            value: "#ffffff"
          },
          number: {
            value: 40,
            density: {
              enable: false
            }
          },
          opacity: {
            value: {
              min: 0.1,
              max: 0.5
            }
          },
          move: {
            direction: "bottom-right",
            enable: true,
            speed: {
              min: 2,
              max: 10
            }
          }
        }
      }} init={init}/>
    </div>
  )
}